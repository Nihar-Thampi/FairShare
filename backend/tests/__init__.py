# Tests run as local development: allow the placeholder JWT secret and never seed the demo admin,
# whatever backend/.env says (config.py loads it with override).
import app.config as _config

_config.DEBUG = True
_config.SEED_DEMO_ADMIN = False
