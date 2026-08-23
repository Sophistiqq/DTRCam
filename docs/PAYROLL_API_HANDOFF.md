# DTRCam — Payroll REST API v1 Handoff Documentation

**Target Audience:** Visual FoxPro (VFP) Payroll Developer & System Integrators  
**Base URL:** `https://<YOUR_APP_DOMAIN>/api/v1`  
**Authentication:** Header `X-API-Key: <YOUR_API_KEY>`

---

## 1. Authentication & Security

All API endpoints are read-only and secured with an API key passed in the request header:

```http
GET /api/v1/punches?from=2026-08-01&to=2026-08-15 HTTP/1.1
Host: dtrcam.onrender.com
X-API-Key: dtr_live_xxxxxxxxxxxxxxxxxxxxxxxx
Accept: application/json
```

- If `X-API-Key` is missing or invalid: `401 Unauthorized`
- Rate limit: **120 requests/minute** per key (returns `429 Too Many Requests` if exceeded).
- Caching: Responses include an `ETag` header. Sending `If-None-Match: <etag>` returns `304 Not Modified` if data hasn't changed.

---

## 2. API Endpoints

### 2.1 `GET /api/v1/attendance` (Recommended for Payroll Ingest)
Returns rolled-up daily attendance rows (1 record per employee per day) containing time-in, time-out, and locations.

#### Query Parameters:
| Param | Type | Description | Example |
|---|---|---|---|
| `from` | string (YYYY-MM-DD) | Start date (inclusive) | `2026-08-01` |
| `to` | string (YYYY-MM-DD) | End date (inclusive) | `2026-08-15` |
| `employee_no` | string | Optional filter by employee number | `1001` |
| `limit` | integer | Max records per page (default: 50, max: 200) | `100` |
| `cursor` | string | Cursor for pagination (next `work_date`) | `2026-08-05` |

#### Response (`200 OK`):
```json
{
  "data": [
    {
      "employee_no": "1001",
      "full_name": "Juan Dela Cruz",
      "work_date": "2026-08-23",
      "time_in": "2026-08-23T08:02:14.000Z",
      "time_out": "2026-08-23T17:05:32.000Z",
      "location_in": "14.599512, 120.984222",
      "location_out": "14.599512, 120.984222",
      "status": "complete",
      "updated_at": "2026-08-23T17:06:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "has_more": false,
    "next_cursor": null
  }
}
```

---

### 2.2 `GET /api/v1/punches` (Detailed Punch Evidence)
Returns normalized individual punch rows (IN and OUT separate), including signed short-lived URLs to verified photos and cryptographic hashes.

#### Query Parameters:
| Param | Type | Description | Example |
|---|---|---|---|
| `from` | string (YYYY-MM-DD) | Start work date | `2026-08-01` |
| `to` | string (YYYY-MM-DD) | End work date | `2026-08-15` |
| `employee_no` | string | Filter by employee number | `1001` |
| `limit` | integer | Page size (default 50, max 200) | `50` |
| `cursor` | string | Next page cursor (`captured_at`) | `2026-08-23T08:02:14.000Z` |

#### Response (`200 OK`):
```json
{
  "data": [
    {
      "id": "c1f72a4e-3990-482f-b44c-9f829f0612aa",
      "employee_no": "1001",
      "full_name": "Juan Dela Cruz",
      "work_date": "2026-08-23",
      "punch_type": "in",
      "captured_at": "2026-08-23T08:02:14.000Z",
      "received_at": "2026-08-23T08:02:16.000Z",
      "location": {
        "source": "gps",
        "lat": 14.599512,
        "lng": 120.984222,
        "accuracy_m": 8.5,
        "manual_text": null,
        "address": "Makati City, Metro Manila"
      },
      "photo_url": "https://wpxxmkwubraotagbtwfp.supabase.co/storage/v1/object/sign/punch-media/punches/...?token=...",
      "payload_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "row_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "status": "accepted",
      "anomaly_flags": {}
    }
  ],
  "pagination": {
    "limit": 50,
    "has_more": false,
    "next_cursor": null
  }
}
```

---

### 2.3 `GET /api/v1/employees` (Active Employee Roster)
Returns the list of registered employees.

#### Response (`200 OK`):
```json
{
  "data": [
    {
      "id": "a0000000-0000-0000-0000-000000001001",
      "employee_no": "1001",
      "full_name": "Juan Dela Cruz",
      "is_active": true,
      "created_at": "2026-08-23T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 2.4 `GET /api/v1/anomalies` (Quarantined / Flagged Punches)
Returns punches that were quarantined (e.g. clock drift ahead of server time, payload tampering, duplicate punch outside grace window) or flagged (e.g. poor GPS accuracy, missing IN punch).

---

## 3. Visual FoxPro (VFP) Integration Example

Below is a Visual FoxPro sample script demonstrating how to query the attendance API using `MSXML2.ServerXMLHTTP.6.0`:

```foxpro
*---------------------------------------------------------------*
* DTRCam_FetchAttendance.prg
* Queries DTRCam Attendance API and imports records into cursor
*---------------------------------------------------------------*
LOCAL oHttp, lcUrl, lcApiKey, lcResponse, lcFrom, lcTo

lcApiKey = "dtr_live_YOUR_ACTUAL_API_KEY"
lcFrom   = "2026-08-01"
lcTo     = "2026-08-15"
lcUrl    = "https://dtrcam.onrender.com/api/v1/attendance?from=" + lcFrom + "&to=" + lcTo

oHttp = CREATEOBJECT("MSXML2.ServerXMLHTTP.6.0")
oHttp.OPEN("GET", lcUrl, .F.)
oHttp.SETREQUESTHEADER("X-API-Key", lcApiKey)
oHttp.SETREQUESTHEADER("Accept", "application/json")

TRY
    oHttp.SEND()
    
    IF oHttp.STATUS == 200
        lcResponse = oHttp.RESPONSETEXT
        ? "Success! Received JSON payload length: ", LEN(lcResponse)
        * Use your JSON parser (e.g., nfJson or West Wind Client Tools) to parse lcResponse
        * e.g. oJson = nfJsonRead(lcResponse)
    ELSE
        ? "HTTP Error: ", oHttp.STATUS, oHttp.STATUSTEXT
        ? oHttp.RESPONSETEXT
    ENDIF
CATCH TO oErr
    ? "Connection Error: ", oErr.Message
ENDTRY

RELEASE oHttp
RETURN
```
