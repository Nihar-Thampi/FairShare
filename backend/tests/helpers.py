"""Shared fixtures for API tests: a throwaway database and registered users."""
import os
import tempfile
import unittest

import app.database as database


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        # config.py loads .env with override=True, so the module global is patched, not the env var.
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self._real_db_path = database.DATABASE_PATH
        database.DATABASE_PATH = self.db_path

        from app import create_app
        self.client = create_app().test_client()
        self.headers = self.register("alice@example.com")

    def tearDown(self):
        database.DATABASE_PATH = self._real_db_path
        os.remove(self.db_path)

    def register(self, email, password="password123", name="Test User"):
        """Register a user and return their Authorization headers."""
        res = self.client.post("/api/auth/register", json={"email": email, "password": password, "name": name})
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        return {"Authorization": f"Bearer {res.get_json()['access_token']}"}

    def make_bill(self, headers=None, items=(), people=("Ann", "Bob")):
        """Create a bill with items (dicts for POST /items) and people; returns (bill, item_rows, person_rows)."""
        headers = headers or self.headers
        bill = self.client.post("/api/bills", json={"name": "Dinner"}, headers=headers).get_json()
        item_rows = [self.client.post(f"/api/bills/{bill['id']}/items", json=i, headers=headers).get_json()
                     for i in items]
        person_rows = [self.client.post(f"/api/bills/{bill['id']}/persons", json={"name": n}, headers=headers).get_json()
                       for n in people]
        return bill, item_rows, person_rows
