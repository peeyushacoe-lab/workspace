import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

const CHALLENGE_TITLE = "Week 4 Cybersecurity Challenge – Red Team vs Blue Team Competition";

const DESCRIPTION =
  "For this week's project, we will be conducting a Red Team vs Blue Team Cybersecurity Challenge. The objective of this challenge is to help you understand how real-world cybersecurity teams operate. One team focuses on the attacker perspective (Pentesting), while the other focuses on the defender perspective (SOC & Digital Forensics). This project will prepare you for upcoming Sage Sentinel testing activities, where understanding both attack techniques and defensive detection methods is essential.\n\nBoth teams will be evaluated on Technical Understanding, Research Quality, Practical Approach, Documentation, MITRE ATT&CK Mapping, and Presentation Quality. The winning team will be the one that demonstrates the strongest cybersecurity thinking and produces the most professional analysis.\n\nTeam leads are responsible for coordinating the work and dividing tasks among members, and for making sure the final report is posted here as a submission before the deadline.";

// No explicit point weights were given for these 6 criteria — split close to
// how the earlier 5-category rubric weighted things (technical/practical work
// heaviest, presentation lightest), summing to 100.
const SCORING_SCHEMA = [
  { key: "technical", label: "Technical Understanding", maxPoints: 20 },
  { key: "research", label: "Research Quality", maxPoints: 20 },
  { key: "practical", label: "Practical Approach", maxPoints: 20 },
  { key: "documentation", label: "Documentation", maxPoints: 15 },
  { key: "mitre", label: "MITRE ATT&CK Mapping", maxPoints: 15 },
  { key: "presentation", label: "Presentation Quality", maxPoints: 10 },
];

const TEAM_RED_MISSION = `Objective: Act as ethical hackers and identify security weaknesses in a controlled environment.

Tasks:
1. Reconnaissance
   - Identify the target application's technologies and attack surface.
   - Perform basic information gathering.
   - Document your findings with screenshots.

2. Vulnerability Assessment
   Identify a minimum of 5 vulnerabilities. For each one, document:
   - Vulnerability name
   - OWASP category
   - Severity level
   - How it was discovered
   - Possible impact
   - Recommended fix

3. Attack Simulation
   - Demonstrate safe exploitation in the provided lab environment.
   - Document the methodology and evidence.

4. MITRE ATT&CK Mapping
   - Map discovered techniques to relevant MITRE ATT&CK techniques.

Final Submission — Pentesting Report including:
Executive Summary, Scope, Methodology, Findings, Screenshots/Evidence, Risk Ratings, MITRE Mapping, Recommendations, Conclusion.

Post your report as a submission on this team's card (notes + links) before the deadline.`;

const TEAM_BLUE_MISSION = `Objective: Act as a Security Operations Centre (SOC) team and investigate a simulated cyber incident.

Tasks:
1. Digital Forensics Investigation — analyse the incident and explain:
   - Indicators of Compromise (IoCs)
   - Evidence collection process
   - Order of volatility
   - Chain of custody
   - How forensic evidence should be preserved

2. Incident Timeline Creation — create an attack timeline showing:
   - Initial compromise
   - Attacker activity
   - Possible data access
   - Detection point
   - Response actions

3. Threat Detection — create detection strategies for suspicious activities such as brute force attempts, suspicious login activity, malware execution, and unusual network behaviour. Explain what logs are required, what behaviour should trigger an alert, and why the activity is suspicious.

4. MITRE ATT&CK Mapping — map attacker behaviour to relevant MITRE ATT&CK techniques.

Final Submission — SOC Investigation Report including:
Incident Summary, Investigation Process, Evidence Analysis, Timeline, Detection Approach, MITRE Mapping, Recommendations, Conclusion.

Post your report as a submission on this team's card (notes + links) before the deadline.`;

// One-off seed for the Week 4 Red-vs-Blue challenge. Creates the challenge
// with both teams' full mission briefs and the scoring rubric, but leaves
// team rosters empty — add members from the challenge's "Edit roster" button
// in the Challenges tab (Intern Hub or Mentor console, same view). Safe to
// run multiple times: if a challenge with this exact title already exists,
// it's returned as-is instead of duplicated.
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Mentors only" }, { status: 403 });
  }

  const existing = await prisma.challenge.findFirst({ where: { title: CHALLENGE_TITLE }, include: { teams: true } });
  if (existing) {
    return NextResponse.json({ challenge: existing, message: "Challenge already exists." });
  }

  // Deadline = the coming Monday at 8:00 PM (or next Monday if it's already
  // past 8pm on a Monday today).
  const now = new Date();
  const deadline = new Date(now);
  const day = deadline.getDay(); // 0 = Sun, 1 = Mon, ...
  let daysUntilMonday = (1 - day + 7) % 7;
  if (daysUntilMonday === 0 && now.getHours() >= 20) daysUntilMonday = 7;
  deadline.setDate(deadline.getDate() + daysUntilMonday);
  deadline.setHours(20, 0, 0, 0);

  const challenge = await prisma.challenge.create({
    data: {
      title: CHALLENGE_TITLE,
      description: DESCRIPTION,
      status: "active",
      deadline,
      scoringSchema: SCORING_SCHEMA,
      createdById: user.id,
      teams: {
        create: [
          { name: "Team Red", color: "red", mission: TEAM_RED_MISSION, leadId: null, memberIds: [] },
          { name: "Team Blue", color: "blue", mission: TEAM_BLUE_MISSION, leadId: null, memberIds: [] },
        ],
      },
    },
    include: { teams: true },
  });

  return NextResponse.json({
    challenge,
    message: `Challenge created with empty rosters. Deadline: ${deadline.toISOString()}. Add members to each team from the challenge page.`,
  });
}
