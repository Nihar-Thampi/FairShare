"""Tests for the money-splitting maths in app.services.split_service.

Run from backend/:  python -m unittest discover -s tests
"""
import unittest

from app.services.split_service import SplitValidationError, calculate_bill
from tests.helpers import ApiTestCase


class SplitServiceTest(ApiTestCase):
    def _assign(self, item, rows, headers=None):
        res = self.client.put(f"/api/items/{item['id']}/assignments", json={"assignments": rows},
                              headers=headers or self.headers)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _calc(self, bill):
        res = self.client.post(f"/api/bills/{bill['id']}/calculate", headers=self.headers)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return res.get_json()["results"]

    def _grand_total(self, items):
        return round(sum(i["total_price"] for i in items), 2)

    def test_equal_split_with_tax_adds_up_exactly(self):
        bill, items, (ann, bob) = self.make_bill(items=[
            {"name": "Pizza", "unit_price": 100},
            {"name": "GST", "unit_price": 18, "is_tax_line": True},
        ])
        self._assign(items[0], [{"person_id": ann["id"]}, {"person_id": bob["id"]}])
        results = self._calc(bill)
        self.assertEqual([r["subtotal"] for r in results], [50.0, 50.0])
        self.assertEqual([r["tax_share"] for r in results], [9.0, 9.0])
        self.assertEqual(sum(r["total"] for r in results), 118.0)

    def test_three_way_split_of_awkward_amount_still_sums_to_invoice(self):
        # 100.00 / 3 does not divide into cents; the leftover cent must land on someone.
        bill, items, people = self.make_bill(
            items=[{"name": "Dessert", "unit_price": 100}], people=("A", "B", "C"))
        self._assign(items[0], [{"person_id": p["id"]} for p in people])
        results = self._calc(bill)
        self.assertEqual(round(sum(r["total"] for r in results), 2), 100.0)
        self.assertTrue(all(33.0 <= r["total"] <= 33.34 for r in results))

    def test_rounding_correction_across_many_items_and_tax(self):
        bill, items, people = self.make_bill(items=[
            {"name": "A", "unit_price": 10.01},
            {"name": "B", "unit_price": 7.77},
            {"name": "C", "quantity": 3, "unit_price": 3.33},
            {"name": "VAT", "unit_price": 5.05, "is_tax_line": True},
        ], people=("A", "B", "C"))
        for item in items[:3]:
            self._assign(item, [{"person_id": p["id"]} for p in people])
        results = self._calc(bill)
        self.assertEqual(round(sum(r["total"] for r in results), 2), self._grand_total(items))

    def test_percentage_split(self):
        bill, items, (ann, bob) = self.make_bill(items=[{"name": "Wine", "unit_price": 200}])
        self._assign(items[0], [
            {"person_id": ann["id"], "split_type": "percentage", "split_value": 75},
            {"person_id": bob["id"], "split_type": "percentage", "split_value": 25},
        ])
        results = self._calc(bill)
        self.assertEqual([r["subtotal"] for r in results], [150.0, 50.0])

    def test_custom_split(self):
        bill, items, (ann, bob) = self.make_bill(items=[{"name": "Steak", "unit_price": 90}])
        self._assign(items[0], [
            {"person_id": ann["id"], "split_type": "custom", "split_value": 60},
            {"person_id": bob["id"], "split_type": "custom", "split_value": 30},
        ])
        results = self._calc(bill)
        self.assertEqual([r["subtotal"] for r in results], [60.0, 30.0])
        self.assertEqual(sum(r["total"] for r in results), 90.0)

    def test_person_not_on_an_item_pays_none_of_it_but_shares_tax(self):
        bill, items, (ann, bob) = self.make_bill(items=[
            {"name": "Salad", "unit_price": 40},
            {"name": "Tax", "unit_price": 10, "is_tax_line": True},
        ])
        self._assign(items[0], [{"person_id": ann["id"]}])
        ann_r, bob_r = self._calc(bill)
        self.assertEqual((ann_r["subtotal"], bob_r["subtotal"]), (40.0, 0.0))
        self.assertEqual((ann_r["total"], bob_r["total"]), (45.0, 5.0))

    def test_breakdown_lists_each_item_share(self):
        bill, items, (ann, bob) = self.make_bill(items=[{"name": "Soup", "unit_price": 9}])
        self._assign(items[0], [{"person_id": ann["id"]}, {"person_id": bob["id"]}])
        results = self._calc(bill)
        self.assertEqual(results[0]["breakdown"], [{"item_id": items[0]["id"], "item_name": "Soup", "amount": 4.5}])

    def test_unassigned_item_is_rejected(self):
        bill, items, _ = self.make_bill(items=[{"name": "Soup", "unit_price": 9}])
        res = self.client.post(f"/api/bills/{bill['id']}/calculate", headers=self.headers)
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.get_json()["unassigned_items"], ["Soup"])

    def test_fewer_than_two_people_is_rejected(self):
        bill, items, _ = self.make_bill(items=[{"name": "Soup", "unit_price": 9}], people=("Solo",))
        with self.assertRaises(SplitValidationError):
            calculate_bill(bill["id"])

    def test_percentages_must_total_100(self):
        bill, items, (ann, bob) = self.make_bill(items=[{"name": "Wine", "unit_price": 200}])
        self._assign(items[0], [
            {"person_id": ann["id"], "split_type": "percentage", "split_value": 60},
            {"person_id": bob["id"], "split_type": "percentage", "split_value": 30},
        ])
        res = self.client.post(f"/api/bills/{bill['id']}/calculate", headers=self.headers)
        self.assertEqual(res.status_code, 422)

    def test_custom_amounts_must_match_item_total(self):
        bill, items, (ann, bob) = self.make_bill(items=[{"name": "Steak", "unit_price": 90}])
        self._assign(items[0], [
            {"person_id": ann["id"], "split_type": "custom", "split_value": 60},
            {"person_id": bob["id"], "split_type": "custom", "split_value": 20},
        ])
        res = self.client.post(f"/api/bills/{bill['id']}/calculate", headers=self.headers)
        self.assertEqual(res.status_code, 422)


if __name__ == "__main__":
    unittest.main()
