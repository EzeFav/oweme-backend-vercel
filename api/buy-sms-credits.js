const https = require("https");

const DB_SECRET = process.env.FIREBASE_DATABASE_SECRET;
const DB_URL = "oweme-33636-default-rtdb.europe-west1.firebasedatabase.app";

function firebaseGet(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: DB_URL,
            path: `/${path}.json?auth=${DB_SECRET}`,
            method: "GET"
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

    const { transaction_id, uid, credits } = req.body;

    if (!transaction_id || !uid || !credits) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        const flwRes = await flutterwaveVerify(transaction_id);

        if (
            flwRes.status !== "success" ||
            flwRes.data.status !== "successful" ||
            flwRes.data.currency !== "NGN"
        ) {
            return res.status(400).json({ error: "Payment not successful" });
        }

        const amount = flwRes.data.amount;
        const validPackages = {
            10: 200,
            30: 500,
            50: 1000
        };

        if (!validPackages[credits] || amount < validPackages[credits]) {
            return res.status(400).json({ error: "Invalid package or amount mismatch" });
        }

        const userData = await firebaseGet(`users/${uid}`);
        const currentCredits = userData && userData.smsCredits ? userData.smsCredits : 0;
        const newCredits = currentCredits + parseInt(credits);

        await firebasePatch(`users/${uid}`, { smsCredits: newCredits });

        return res.json({
            success: true,
            message: `${credits} SMS credits added!`,
            newTotal: newCredits
        });
    } catch (error) {
        return res.status(500).json({ error: "Server error: " + error.message });
    }
};