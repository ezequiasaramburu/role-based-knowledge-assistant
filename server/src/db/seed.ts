import bcrypt from "bcryptjs";
import { pool } from "./pool";

const ROLES = ["finance", "procurement", "hr", "operations"] as const;

const USERS: { email: string; password: string; displayName: string; roles: string[] }[] = [
  { email: "alice@emotech-demo.test", password: "demo1234", displayName: "Alice Chen", roles: ["finance"] },
  { email: "bob@emotech-demo.test", password: "demo1234", displayName: "Bob Martinez", roles: ["hr"] },
  { email: "carol@emotech-demo.test", password: "demo1234", displayName: "Carol Nguyen", roles: ["procurement", "operations"] },
  { email: "dave@emotech-demo.test", password: "demo1234", displayName: "Dave Okafor", roles: [] },
];

const DOCUMENTS: { title: string; body: string; department: string; visibility: "public" | "restricted"; roles: string[] }[] = [
  {
    title: "Employee Handbook Overview",
    body: "This handbook summarizes company-wide policies for all employees, including working hours, code of conduct, and benefits enrollment. Every employee, regardless of department, is expected to read and follow the guidelines described here. New hires receive a printed copy during orientation and are assigned an onboarding buddy for their first 30 days. For department-specific procedures, refer to your team's internal documentation. Questions about handbook content that aren't covered by department-specific policy should be directed to People Operations.",
    department: "general",
    visibility: "public",
    roles: [],
  },
  {
    title: "Office Locations & Contacts",
    body: "Our office locations include the San Francisco headquarters, the Austin engineering hub, and the Lisbon operations center. Each office location has a dedicated front-desk contact and facilities manager, reachable during local business hours. For directions or visitor badges, contact the front desk of the relevant office location before arrival. Employees traveling between office locations can book a shared desk in advance through the workplace app; guest wifi credentials are available at every front desk.",
    department: "general",
    visibility: "public",
    roles: [],
  },
  {
    title: "Q3 Expense Approval Policy",
    body: "The expense approval threshold for Q3 is set at $500 for individual contributors and $5,000 for department heads. Any expense above the approval threshold requires sign-off from a Finance director in addition to the direct manager. Expenses submitted without a receipt are automatically rejected regardless of amount. Travel expenses are the one exception: airfare and lodging booked through the corporate travel portal are pre-approved up to $3,000 without additional sign-off. All approved expenses are reimbursed within two pay cycles of submission.",
    department: "finance",
    visibility: "restricted",
    roles: ["finance"],
  },
  {
    title: "Vendor Payment Terms",
    body: "Standard vendor payment terms are net-30 from invoice receipt, with net-15 available for vendors enrolled in the early-payment discount program. Payment terms exceeding net-60 require Finance leadership approval. All vendor payment terms must be documented in the vendor contract before the first invoice is issued. International vendors are paid in their local currency where possible, and any wire transfer fees are absorbed by Finance rather than deducted from the vendor's payment. Disputed invoices are placed on hold until Procurement and the vendor resolve the discrepancy in writing.",
    department: "finance",
    visibility: "restricted",
    roles: ["finance"],
  },
  {
    title: "Parental Leave Policy",
    body: "Eligible employees receive 16 weeks of paid parental leave following the birth, adoption, or fostering of a child. Parental leave can be taken continuously or split into two blocks within the first 12 months. Employees should notify HR at least 30 days in advance of their intended parental leave start date whenever possible. Health benefits continue uninterrupted during parental leave, and employees accrue PTO as though actively working. Employees returning from parental leave are guaranteed reinstatement to their same role or an equivalent one at the same level and pay.",
    department: "hr",
    visibility: "restricted",
    roles: ["hr"],
  },
  {
    title: "Performance Review Cycle",
    body: "Performance reviews run twice a year, in June and December, and combine self-assessment, peer feedback, and manager evaluation. The performance review cycle determines eligibility for merit increases and promotion nominations. Managers must submit performance review scores within two weeks of the cycle closing. Before scores are finalized, department heads participate in a calibration session to ensure ratings are applied consistently across teams. Employees receive written feedback and a documented development plan within one week of calibration.",
    department: "hr",
    visibility: "restricted",
    roles: ["hr"],
  },
  {
    title: "Approved Supplier List Criteria",
    body: "The criteria for approved suppliers includes financial stability review, on-time delivery history above 95%, and a signed code-of-conduct agreement. Suppliers failing to meet the approved supplier criteria are placed on probation for one quarter before removal. Procurement re-evaluates the approved supplier list annually. New suppliers must also pass a site audit for suppliers providing physical goods, or a data-security questionnaire for software and services vendors. Sole-source suppliers with no viable alternative are exempt from the competitive-bid requirement but still must meet all other approved supplier criteria.",
    department: "procurement",
    visibility: "restricted",
    roles: ["procurement"],
  },
  {
    title: "Purchase Order Thresholds",
    body: "Purchase orders under $2,000 can be approved by a single procurement analyst. Purchase order thresholds above $2,000 require a second approver, and purchase orders above $25,000 require Procurement director sign-off. Splitting a purchase to stay under a threshold is a policy violation. Emergency purchases needed to prevent an operational outage may be approved verbally by any director, but must be documented and formally logged in the purchase order system within 48 hours. Recurring purchase orders for the same vendor are reviewed at renewal against current purchase order thresholds.",
    department: "procurement",
    visibility: "restricted",
    roles: ["procurement"],
  },
  {
    title: "Warehouse Safety Checklist",
    body: "Warehouse staff must complete the daily safety checklist before operating forklifts or pallet jacks, covering equipment inspection, clear aisle verification, and emergency exit access. Any warehouse safety checklist item marked as failed must be resolved before the shift begins. Repeated checklist failures are reported to Operations management. All warehouse staff must complete forklift certification training annually, and completed checklists are retained for 12 months for audit purposes. Shift leads spot-check a random sample of completed checklists each week to confirm they reflect actual conditions on the floor.",
    department: "operations",
    visibility: "restricted",
    roles: ["operations"],
  },
  {
    title: "Cold Chain Handling Procedure",
    body: "Temperature-sensitive shipments must remain within the cold chain range of 2-8°C from receiving through storage. Any cold chain handling procedure breach exceeding 15 minutes must be logged and the affected shipment quarantined for inspection. Operations reviews cold chain compliance reports weekly. Cold storage units are fitted with continuous temperature loggers that alert the on-duty supervisor automatically if a unit drifts outside range. Quarantined shipments are held until Quality Assurance signs off on disposal or release, and every breach is included in the weekly cold chain compliance report regardless of outcome.",
    department: "operations",
    visibility: "restricted",
    roles: ["operations"],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "TRUNCATE TABLE audit_log, message_sources, chat_messages, chat_sessions, document_permissions, documents, user_roles, roles, users CASCADE"
    );

    const roleIds = new Map<string, string>();
    for (const name of ROLES) {
      const result = await client.query<{ id: string }>(
        "INSERT INTO roles (name) VALUES ($1) RETURNING id",
        [name]
      );
      roleIds.set(name, result.rows[0].id);
    }

    for (const user of USERS) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      const userResult = await client.query<{ id: string }>(
        "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
        [user.email, passwordHash, user.displayName]
      );
      const userId = userResult.rows[0].id;

      for (const roleName of user.roles) {
        const roleId = roleIds.get(roleName);
        if (!roleId) throw new Error(`Unknown role: ${roleName}`);
        await client.query(
          "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
          [userId, roleId]
        );
      }
    }

    for (const doc of DOCUMENTS) {
      const docResult = await client.query<{ id: string }>(
        "INSERT INTO documents (title, body, department, visibility) VALUES ($1, $2, $3, $4) RETURNING id",
        [doc.title, doc.body, doc.department, doc.visibility]
      );
      const docId = docResult.rows[0].id;

      for (const roleName of doc.roles) {
        const roleId = roleIds.get(roleName);
        if (!roleId) throw new Error(`Unknown role: ${roleName}`);
        await client.query(
          "INSERT INTO document_permissions (document_id, role_id) VALUES ($1, $2)",
          [docId, roleId]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${ROLES.length} roles, ${USERS.length} users, ${DOCUMENTS.length} documents.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
