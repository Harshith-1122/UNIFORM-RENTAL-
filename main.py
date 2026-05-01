from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import sqlite3
import os

app = FastAPI(title="S.R Uniform Rentals API")

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "database.db"

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Inventory Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        size TEXT NOT NULL,
        total_stock INTEGER NOT NULL,
        rented_out INTEGER NOT NULL DEFAULT 0,
        UNIQUE(type, size)
    )
    ''')
    
    # Bookings Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT NOT NULL,
        event_date TEXT NOT NULL,
        return_date TEXT NOT NULL,
        total_cost INTEGER NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'Pending',
        booking_status TEXT NOT NULL DEFAULT 'Active'
    )
    ''')
    
    # Booking Items Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS booking_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY(booking_id) REFERENCES bookings(id)
    )
    ''')
    
    # Seed default inventory if empty
    cursor.execute("SELECT COUNT(*) FROM inventory")
    if cursor.fetchone()[0] == 0:
        default_sizes = {"S": 20, "M": 30, "L": 40, "XL": 20, "XXL": 10}
        for item_type in ["shirts", "trousers"]:
            for size, count in default_sizes.items():
                cursor.execute(
                    "INSERT INTO inventory (type, size, total_stock, rented_out) VALUES (?, ?, ?, ?)",
                    (item_type, size, count, 0)
                )
    
    conn.commit()
    conn.close()

# Run DB initialization on startup
@app.on_event("startup")
def startup_event():
    init_db()

# Models
class CartItem(BaseModel):
    size: str
    quantity: int

class BookingRequest(BaseModel):
    client_name: str
    event_date: str
    return_date: str
    shirts: List[CartItem]
    trousers: List[CartItem]

class InventoryAdjustment(BaseModel):
    type: str
    size: str
    action: str # "rent" or "return"
    qty: int

# --- API Endpoints ---

@app.get("/api/inventory")
def get_inventory():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inventory")
    rows = cursor.fetchall()
    conn.close()
    
    # Format to match the frontend expectations
    inventory = {
        "shirts": {"price": 30, "sizes": {}},
        "trousers": {"price": 30, "sizes": {}}
    }
    
    for row in rows:
        item_type = row["type"]
        size = row["size"]
        inventory[item_type]["sizes"][size] = {
            "total": row["total_stock"],
            "rented": row["rented_out"]
        }
        
    return inventory

@app.post("/api/book")
def create_booking(request: BookingRequest):
    conn = get_db()
    cursor = conn.cursor()
    
    total_cost = 0
    items_to_rent = []
    
    # Validate and calculate
    for item_type, items in [("shirts", request.shirts), ("trousers", request.trousers)]:
        for item in items:
            if item.quantity > 0:
                # Check stock
                cursor.execute("SELECT total_stock, rented_out FROM inventory WHERE type=? AND size=?", (item_type, item.size))
                row = cursor.fetchone()
                if not row:
                    conn.close()
                    raise HTTPException(status_code=400, detail=f"Invalid size {item.size} for {item_type}")
                
                available = row["total_stock"] - row["rented_out"]
                if item.quantity > available:
                    conn.close()
                    raise HTTPException(status_code=400, detail=f"Not enough stock for {item_type} size {item.size}")
                
                items_to_rent.append((item_type, item.size, item.quantity))
                total_cost += item.quantity * 30
    
    if not items_to_rent:
        conn.close()
        raise HTTPException(status_code=400, detail="Cart is empty")

    try:
        # Create booking record
        cursor.execute(
            "INSERT INTO bookings (client_name, event_date, return_date, total_cost) VALUES (?, ?, ?, ?)",
            (request.client_name, request.event_date, request.return_date, total_cost)
        )
        booking_id = cursor.lastrowid
        
        # Insert items and update inventory
        for item_type, size, quantity in items_to_rent:
            cursor.execute(
                "INSERT INTO booking_items (booking_id, item_type, size, quantity) VALUES (?, ?, ?, ?)",
                (booking_id, item_type, size, quantity)
            )
            cursor.execute(
                "UPDATE inventory SET rented_out = rented_out + ? WHERE type=? AND size=?",
                (quantity, item_type, size)
            )
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
    
    conn.close()
    return {"status": "success", "booking_id": booking_id, "total_cost": total_cost}


@app.get("/api/admin/bookings")
def get_all_bookings():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM bookings ORDER BY id DESC")
    bookings = [dict(row) for row in cursor.fetchall()]
    
    for booking in bookings:
        cursor.execute("SELECT item_type, size, quantity FROM booking_items WHERE booking_id=?", (booking["id"],))
        booking["items"] = [dict(row) for row in cursor.fetchall()]
        
    conn.close()
    return bookings

@app.post("/api/admin/bookings/{booking_id}/pay")
def mark_payment_paid(booking_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE bookings SET payment_status = 'Paid' WHERE id=?", (booking_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.post("/api/admin/bookings/{booking_id}/return")
def mark_booking_returned(booking_id: int):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if already returned
    cursor.execute("SELECT booking_status FROM bookings WHERE id=?", (booking_id,))
    row = cursor.fetchone()
    if not row or row["booking_status"] == 'Returned':
        conn.close()
        return {"status": "already_returned"}
        
    # Get items to return to inventory
    cursor.execute("SELECT item_type, size, quantity FROM booking_items WHERE booking_id=?", (booking_id,))
    items = cursor.fetchall()
    
    try:
        for item in items:
            cursor.execute(
                "UPDATE inventory SET rented_out = rented_out - ? WHERE type=? AND size=?",
                (item["quantity"], item["item_type"], item["size"])
            )
        
        # Mark booking as returned
        cursor.execute("UPDATE bookings SET booking_status = 'Returned' WHERE id=?", (booking_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
        
    conn.close()
    return {"status": "success"}

@app.post("/api/admin/inventory")
def manual_inventory_adjustment(adj: InventoryAdjustment):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT rented_out, total_stock FROM inventory WHERE type=? AND size=?", (adj.type, adj.size))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")
        
    new_rented = row["rented_out"]
    if adj.action == "rent":
        new_rented += adj.qty
        if new_rented > row["total_stock"]:
            new_rented = row["total_stock"]
    elif adj.action == "return":
        new_rented -= adj.qty
        if new_rented < 0:
            new_rented = 0
            
    cursor.execute("UPDATE inventory SET rented_out = ? WHERE type=? AND size=?", (new_rented, adj.type, adj.size))
    conn.commit()
    conn.close()
    
    return {"status": "success"}

@app.post("/api/admin/reset")
def reset_database():
    os.remove(DB_FILE)
    init_db()
    return {"status": "success"}
