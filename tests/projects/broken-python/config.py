import os

BASE_URL = os.getenv("XPAYMENT_BASE_URL", "https://api.xpayment.kz").rstrip("/") + "/v2"
API_KEY = os.getenv("XPAYMENT_API_KEY", "xapi_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
DEVICE_KEY = os.getenv("XPAYMENT_DEVICE_KEY", "")
DEVICE_NAME = os.getenv("XPAYMENT_DEVICE_NAME", "Kassa1")
WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET", "shop-secret-2025")
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8000")
