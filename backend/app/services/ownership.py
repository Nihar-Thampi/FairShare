"""Per-user ownership lookups. Each returns the row, or None if it is missing or not the user's."""


def owned_bill(db, bill_id: int, user_id: int):
    return db.execute("SELECT * FROM bills WHERE id = ? AND user_id = ?", (bill_id, user_id)).fetchone()


def owned_item(db, item_id: int, user_id: int):
    return db.execute(
        """SELECT bi.* FROM bill_items bi
           JOIN bills b ON b.id = bi.bill_id
           WHERE bi.id = ? AND b.user_id = ?""",
        (item_id, user_id)
    ).fetchone()


def owned_person(db, person_id: int, user_id: int):
    return db.execute(
        """SELECT p.* FROM persons p
           JOIN bills b ON b.id = p.bill_id
           WHERE p.id = ? AND b.user_id = ?""",
        (person_id, user_id)
    ).fetchone()
