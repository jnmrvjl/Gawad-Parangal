netlify/functions/admin-action.js
//
// Called by admin.html to load the registrant list. Reads submissions from
// Netlify's own Forms API (needs NETLIFY_API_TOKEN + NETLIFY_SITE_ID), then
// attaches whatever status ("received" / "confirmed" / "rejected" /
// "waitlist") we've previously stored for each one in Netlify Blobs.

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const passcode = event.headers["x-admin-passcode"];
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  if (!siteId || !token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN environment variable." })
    };
  }

  try {
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/submissions`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const bodyText = await res.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Netlify API responded with ${res.status}`, detail: bodyText })
      };
    }

    const submissions = await res.json();
    const store = getStore("registrant-status");
    const refStore = getStore("registrant-refs");

    const registrants = await Promise.all(
      submissions.map(async (sub) => {
        const d = sub.data || {};
        let status = "pending";
        try {
          const stored = await store.get(sub.id, { type: "json" });
          if (stored && stored.status) status = stored.status;
        } catch (e) {
          // no status stored yet — stays "pending"
        }

        let referenceNumber = null;
        try {
          const refData = await refStore.get(sub.id, { type: "json" });
          if (refData && refData.referenceNumber) referenceNumber = refData.referenceNumber;
        } catch (e) {
          // reference not assigned yet (submission-created hasn't run, or ran before this feature existed)
        }

        return {
          id: sub.id,
          referenceNumber: referenceNumber,
          name: d.name || "",
          address: d.address || "",
          email: d.email || "",
          phone: d.phone || "",
          yearLevel: d.yearLevel || "",
          award: d.award || "",
          licensureOf: d.licensureOf || "",
          awardDate: d.awardDate || "",
          validIdUrl: d.valid_id || "",
          proofOfAwardUrl: d.proof_of_award || "",
          formalPhotoUrl: d.formal_photo || "",
          submittedAt: sub.created_at,
          status: status
        };
      })
    );

    registrants.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrants })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
