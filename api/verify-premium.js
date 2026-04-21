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

function paystackVerify(reference) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.paystack.co",
            path: `/transaction/verify/${reference}`,
            method: "GET",
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
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

    const { reference, uid } = req.body;

    if (!reference || !uid) {
        return res.status(400).json({ error: "Missing reference or uid" });
    }

    try {
        const paystackRes = await paystackVerify(reference);

        if (
            paystackRes.data.status === "success" &&
            paystackRes.data.amount >= 150000
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