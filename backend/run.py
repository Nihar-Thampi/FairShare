from app import create_app
from app.config import DEBUG

app = create_app()

if __name__ == "__main__":
    app.run(debug=DEBUG, port=5000, host="0.0.0.0")
