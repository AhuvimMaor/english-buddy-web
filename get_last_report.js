const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (getApps().length === 0) {
  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-english-buddy' });
}
const db = getFirestore();

async function run() {
  const reports = await db.collection('reports').orderBy('createdAt', 'desc').limit(1).get();
  if (reports.empty) {
    console.log("No reports found.");
    return;
  }
  const report = reports.docs[0].data();
  console.log("Call ID:", report.callId);
  console.log("Transcript:");
  console.log(JSON.stringify(report.transcript, null, 2));
}
run().catch(console.error);
