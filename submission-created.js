// netlify/functions/submission-created.js
//
// Netlify automatically calls a function with this exact filename whenever a
// new Forms submission comes in — no manual trigger setup needed for this
// one (unlike admin-list/admin-action, which need the installable trigger
// described in the setup guide... actually this one just needs to exist in
// netlify/functions and be named "submission-created").
//
// It assigns the next sequential reference number (SKGawad001, SKGawad002,
// ...) and stores it in Netlify Blobs, keyed by the submission's ID, so
// admin-list.js can look it up later.

const { getStore } = require("@netlify/blobs");

const REF_PREFIX = "SKGawad";

exports.handler = async function (event) {
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 200, body: "ignored: bad payload" };
  }

  // Netlify wraps the submission data under `payload` for this trigger.
  const submission = payload && payload.payload ? payload.payload : payload;
  const submissionId = submission && submission.id;

  if (!submissionId) {
    return { statusCode: 200, body: "ignored: no submission id" };
  }

  try {
    const counterStore = getStore("reference-counter");
    let count = 0;
    try {
      const stored = await counterStore.get("count", { type: "json" });
      if (stored && typeof stored.count === "number") count = stored.count;
    } catch (e) {
      // no counter yet, starts at 0
    }

    count += 1;
    await counterStore.setJSON("count", { count: count });

    const referenceNumber = REF_PREFIX + String(count).padStart(3, "0");

    const refStore = getStore("registrant-refs");
    await refStore.setJSON(submissionId, {
      referenceNumber: referenceNumber,
      assignedAt: new Date().toISOString()
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, referenceNumber: referenceNumber }) };
  } catch (err) {
    // Never fail loudly here — a broken reference-number assignment
    // shouldn't affect the registrant's actual submission in any way.
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(err && err.message || err) }) };
  }
};
