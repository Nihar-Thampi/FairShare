import json
from app.database import get_db


class SplitValidationError(Exception):
    def __init__(self, message, items=None):
        super().__init__(message)
        self.message = message
        self.items = items or []


def calculate_bill(bill_id: int) -> list[dict]:
    with get_db() as db:
        persons = db.execute(
            "SELECT * FROM persons WHERE bill_id = ?", (bill_id,)
        ).fetchall()
        persons = [dict(p) for p in persons]

        if len(persons) < 2:
            raise SplitValidationError("A bill must have at least 2 people to calculate a split.")

        items = db.execute(
            "SELECT * FROM bill_items WHERE bill_id = ? ORDER BY sort_order, id", (bill_id,)
        ).fetchall()
        items = [dict(i) for i in items]

        food_items = [i for i in items if not i["is_tax_line"]]
        tax_items = [i for i in items if i["is_tax_line"]]

        # Load all assignments for this bill's food items in one query
        if food_items:
            item_ids = tuple(i["id"] for i in food_items)
            placeholders = ",".join("?" * len(item_ids))
            all_assignments = db.execute(
                f"SELECT * FROM item_assignments WHERE item_id IN ({placeholders})", item_ids
            ).fetchall()
            all_assignments = [dict(a) for a in all_assignments]
        else:
            all_assignments = []

        # Build assignment map: item_id -> [assignment, ...]
        assignment_map: dict[int, list] = {i["id"]: [] for i in food_items}
        for a in all_assignments:
            if a["item_id"] in assignment_map:
                assignment_map[a["item_id"]].append(a)

        # Validate every food item has at least one assignment
        unassigned = [i["name"] for i in food_items if not assignment_map[i["id"]]]
        if unassigned:
            raise SplitValidationError(
                f"The following items have no one assigned to them: {', '.join(unassigned)}",
                items=unassigned
            )

        person_ids = [p["id"] for p in persons]
        totals: dict[int, dict] = {
            pid: {"subtotal": 0.0, "tax_share": 0.0, "total": 0.0, "breakdown": []}
            for pid in person_ids
        }

        # Calculate food item shares
        for item in food_items:
            assignments = assignment_map[item["id"]]
            split_type = assignments[0]["split_type"] if assignments else "equal"

            if split_type == "equal":
                share = round(item["total_price"] / len(assignments), 10)
                for a in assignments:
                    pid = a["person_id"]
                    if pid in totals:
                        totals[pid]["subtotal"] += share
                        totals[pid]["breakdown"].append({
                            "item_id": item["id"],
                            "item_name": item["name"],
                            "amount": share
                        })

            elif split_type == "percentage":
                total_pct = sum(a["split_value"] or 0 for a in assignments)
                if abs(total_pct - 100.0) > 0.01:
                    raise SplitValidationError(
                        f"Percentages for '{item['name']}' sum to {total_pct:.2f}%, must equal 100%."
                    )
                for a in assignments:
                    pid = a["person_id"]
                    if pid in totals:
                        share = item["total_price"] * ((a["split_value"] or 0) / 100.0)
                        totals[pid]["subtotal"] += share
                        totals[pid]["breakdown"].append({
                            "item_id": item["id"],
                            "item_name": item["name"],
                            "amount": share
                        })

            elif split_type == "custom":
                total_custom = sum(a["split_value"] or 0 for a in assignments)
                if abs(total_custom - item["total_price"]) > 0.01:
                    raise SplitValidationError(
                        f"Custom amounts for '{item['name']}' sum to ${total_custom:.2f}, "
                        f"but item total is ${item['total_price']:.2f}."
                    )
                for a in assignments:
                    pid = a["person_id"]
                    if pid in totals:
                        share = a["split_value"] or 0
                        totals[pid]["subtotal"] += share
                        totals[pid]["breakdown"].append({
                            "item_id": item["id"],
                            "item_name": item["name"],
                            "amount": share
                        })

        # Tax: always split equally among all persons
        total_tax = sum(t["total_price"] for t in tax_items)
        if total_tax > 0 and persons:
            tax_per_person = total_tax / len(persons)
            for pid in person_ids:
                totals[pid]["tax_share"] = tax_per_person

        # Compute totals
        for pid in person_ids:
            totals[pid]["subtotal"] = round(totals[pid]["subtotal"], 2)
            totals[pid]["tax_share"] = round(totals[pid]["tax_share"], 2)
            totals[pid]["total"] = round(totals[pid]["subtotal"] + totals[pid]["tax_share"], 2)
            # Round breakdown amounts
            for b in totals[pid]["breakdown"]:
                b["amount"] = round(b["amount"], 2)

        # Rounding correction: ensure computed totals equal grand total
        grand_total = round(sum(i["total_price"] for i in items), 2)
        computed_total = round(sum(totals[pid]["total"] for pid in person_ids), 2)
        diff = round(grand_total - computed_total, 2)
        if diff != 0:
            richest_pid = max(person_ids, key=lambda pid: totals[pid]["total"])
            totals[richest_pid]["total"] = round(totals[richest_pid]["total"] + diff, 2)

        # Persist results
        person_map = {p["id"]: p for p in persons}
        results = []
        for pid in person_ids:
            t = totals[pid]
            db.execute(
                """INSERT OR REPLACE INTO calculation_results
                   (bill_id, person_id, subtotal, tax_share, total, breakdown)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (bill_id, pid, t["subtotal"], t["tax_share"], t["total"], json.dumps(t["breakdown"]))
            )
            results.append({
                "person": person_map[pid],
                "subtotal": t["subtotal"],
                "tax_share": t["tax_share"],
                "total": t["total"],
                "breakdown": t["breakdown"]
            })

        db.execute(
            "UPDATE bills SET status = 'calculated', updated_at = datetime('now') WHERE id = ?",
            (bill_id,)
        )

    return results
