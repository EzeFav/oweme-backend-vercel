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

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { uid, phone, message } = req.body;

    if (!uid || !phone || !message) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        const userData = await firebaseGet(`users/${uid}`);
        const currentCredits = userData && userData.smsCredits ? userData.smsCredits : 0;

        if (currentCredits <= 0) {
            return res.status(400).json({
                error: "Insufficient SMS credits",
                credits: 0
            });
        }

        let formattedPhone = phone.replace(/[^0-9]/g, "");
        if (formattedPhone.startsWith("0")) {
            formattedPhone = "234" + formattedPhone.substring(1);
        }

        const smsPayload = JSON.stringify({
            from: "OweMe",
            to: formattedPhone,
            body: message
        });

        const smsRes = await new Promise((resolve, reject) => {
            const options = {
                hostname: "www.bulksmsnigeria.com",
                path: "/api/v2/sms",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": `Bearer ${process.env.BULKSMS_API_TOKEN}`,
                    "Content-Length": Buffer.byteLength(smsPayload)
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
            request.write(smsPayload);
            request.end();
        });

        console.log("BulkSMS response:", JSON.stringify(smsRes));

        if (smsRes.success === true) {
            await firebasePatch(`users/${uid}`, {
                smsCredits: currentCredits - 1
            });
            return res.json({
                success: true,
                message: "SMS sent successfully",
                creditsRemaining: currentCredits - 1
            });
        } else {
            return res.status(500).json({
                error: "BulkSMS failed to send SMS",
                details: smsRes
            });
        }
    } catch (error) {
        return res.status(500).json({ error: "Server error: " + error.message });
    }
};