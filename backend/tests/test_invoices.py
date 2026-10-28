"""Tests for invoice fields: metadata merging, validation and the bills API.

Run from backend/:  python -m unittest discover -s tests
"""
import os
import sqlite3
import tempfile
import unittest
from datetime import date

import app.database as database
from app.services.invoice_service import (
    InvoiceFieldError, merge_page_metadata, validate_invoice_update,
)


class MergePageMetadataTest(unittest.TestCase):
    def test_header_fields_come_from_first_page_that_has_them(self):
        meta = merge_page_metadata([
            {"business_name": "Acme Supplies", "invoice_number": None, "currency": "inr"},
            {"business_name": "Ignored", "invoice_number": "INV-42", "invoice_date": "2026-03-12"},
        ])
        self.assertEqual(meta["vendor_name"], "Acme Supplies")
        self.assertEqual(meta["invoice_number"], "INV-42")
        self.assertEqual(meta["invoice_date"], "2026-03-12")
        self.assertEqual(meta["currency"], "INR")

    def test_grand_total_comes_from_last_page_that_has_one(self):
        meta = merge_page_metadata([
            {"grand_total": 100},
            {"grand_total": 2450.5},
            {"grand_total": None},
        ])
        self.assertEqual(meta["extracted_total"], 2450.5)

    def test_malformed_values_are_dropped_not_guessed(self):
        meta = merge_page_metadata([{
            "invoice_date": "12/03/2026",
            "due_date": "2026-02-30",
            "currency": "Rs",
            "grand_total": "n/a",
        }])
        self.assertIsNone(meta["invoice_date"])
        self.assertIsNone(meta["due_date"])
        self.assertIsNone(meta["currency"])
        self.assertIsNone(meta["extracted_total"])


class ValidateInvoiceUpdateTest(unittest.TestCase):
    def test_marking_paid_records_today_when_no_date_given(self):
        updates = validate_invoice_update({"payment_status": "paid"})
        self.assertEqual(updates["paid_at"], date.today().isoformat())

    def test_marking_paid_keeps_an_explicit_date(self):
        updates = validate_invoice_update({"payment_status": "paid", "paid_at": "2026-01-05"})
        self.assertEqual(updates["paid_at"], "2026-01-05")

    def test_marking_unpaid_clears_paid_date(self):
        updates = validate_invoice_update({"payment_status": "unpaid"})
        self.assertIsNone(updates["paid_at"])

    def test_empty_strings_clear_fields(self):
        updates = validate_invoice_update({"vendor_name": "  ", "due_date": "", "currency": ""})
        self.assertEqual(updates, {"vendor_name": None, "due_date": None, "currency": None})

    def test_invalid_values_are_rejected(self):
        for body in ({"due_date": "next week"}, {"currency": "rupees"}, {"payment_status": "overdue"}):
            with self.subTest(body=body), self.assertRaises(InvoiceFieldError):
                validate_invoice_update(body)


class BillsApiTest(unittest.TestCase):
    def setUp(self):
        # Point the app at a throwaway database. config.py loads .env with
        # override=True, so the module global is patched rather than the env var.
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self._real_db_path = database.DATABASE_PATH
        database.DATABASE_PATH = self.db_path

        from app import create_app
        self.client = create_app().test_client()
        res = self.client.post("/api/auth/login", json={"email": "admin@admin.com", "password": "admin123"})
        self.headers = {"Authorization": f"Bearer {res.get_json()['access_token']}"}

    def tearDown(self):
        database.DATABASE_PATH = self._real_db_path
        os.remove(self.db_path)

    def _create_bill_with_items(self):
        bill = self.client.post("/api/bills", json={"name": "Office supplies"}, headers=self.headers).get_json()
        for item in ({"name": "Paper", "quantity": 2, "unit_price": 150},
                     {"name": "GST", "quantity": 1, "unit_price": 54, "is_tax_line": True}):
            self.client.post(f"/api/bills/{bill['id']}/items", json=item, headers=self.headers)
        return bill

    def test_list_includes_totals_and_default_payment_status(self):
        self._create_bill_with_items()
        [bill] = self.client.get("/api/bills", headers=self.headers).get_json()
        self.assertEqual(bill["total"], 354.0)
        self.assertEqual(bill["tax_total"], 54.0)
        self.assertEqual(bill["item_count"], 2)
        self.assertEqual(bill["payment_status"], "unpaid")

    def test_patch_updates_invoice_fields(self):
        bill = self._create_bill_with_items()
        res = self.client.patch(f"/api/bills/{bill['id']}", headers=self.headers, json={
            "vendor_name": "Acme Supplies",
            "invoice_number": "INV-42",
            "due_date": "2026-11-30",
            "currency": "inr",
            "payment_status": "paid",
        })
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["vendor_name"], "Acme Supplies")
        self.assertEqual(body["currency"], "INR")
        self.assertEqual(body["payment_status"], "paid")
        self.assertEqual(body["paid_at"], date.today().isoformat())

    def test_patch_rejects_invalid_date(self):
        bill = self._create_bill_with_items()
        res = self.client.patch(f"/api/bills/{bill['id']}", json={"due_date": "31/11/2026"}, headers=self.headers)
        self.assertEqual(res.status_code, 422)

    def test_migration_adds_invoice_columns_to_an_existing_database(self):
        # A database created before invoice fields existed gains them on startup.
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DROP TABLE bills")
            conn.execute("CREATE TABLE bills (id INTEGER PRIMARY KEY, name TEXT, status TEXT)")
        database.init_db()
        with sqlite3.connect(self.db_path) as conn:
            cols = {row[1] for row in conn.execute("PRAGMA table_info(bills)")}
        self.assertTrue(set(database.INVOICE_COLUMNS) <= cols)


if __name__ == "__main__":
    unittest.main()
