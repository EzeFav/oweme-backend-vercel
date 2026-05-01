const https = require("https");

const DB_SECRET = process.env.FIREBASE_DATABASE_SECRET;
const DB_URL = "oweme-33636-default-rtdb.europe-west1.firebasedatabase.app";

function firebasePatch(path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const options = {
            hostname: DB_URL,
            path: `/${path}.json?auth=${DB_SECRET}`,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            }
        };
        const request = https.request(options, (response) => {
            let data = "";
            response.on("data", chunk => data += chunk);
            response.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });
        request.on("error", reject);
        request.write(payload);
        request.end();
    });
}

function flutterwaveVerify(transactionId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.flutterwave.com",
            path: `/v3/transactions/${transactionId}/verify`,
            method: "GET",
            headers: {
                Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
            }
        };
        const request = https.request(options, (response) => {
            let data = "";
            response.on("data", chunk => data += chunk);
            response.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });
        request.on("error", reject);
        request.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { transaction_id, uid } = req.body;

    if (!transaction_id || !uid) {
        return res.status(400).json({ error: "Missing transaction_id or uid" });
    }

    try {
        const flwRes = await flutterwaveVerify(transaction_id);

        if (
            flwRes.status === "success" &&
            flwRes.data.status === "successful" &&
            flwRes.data.amount >= 1500 &&
            flwRes.data.currency === "NGN"
        ) {
            await firebasePatch(`users/${uid}`, {
                isPremium: true,
                premiumSince: Date.now()
            });
            return res.json({ success: true, message: "Premium unlocked!" });
        } else {
            return res.status(400).json({ error: "Payment verification failed" });
        }
    } catch (error) {
        return res.status(500).json({ error: "Server error: " + error.message });
    }
};