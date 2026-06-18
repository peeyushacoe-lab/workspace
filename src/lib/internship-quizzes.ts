// Pre-built module quizzes for the CyberSage Intern Handbook.
// Keyed by weekNumber -> topic `order` -> quiz. Used both when seeding the
// handbook fresh and by POST /api/internship/seed-quizzes to backfill modules
// that were already seeded before quizzes existed.

export type SeedQuizQuestion = {
  id: string;
  type: "mcq" | "text";
  prompt: string;
  options?: string[];
  answerIndex?: number;
};
export type SeedQuiz = { questions: SeedQuizQuestion[] };

export const MODULE_QUIZZES: Record<number, Record<number, SeedQuiz>> = {
  // ── Week 0 — Prerequisites (Lab setup) ──────────────────────────────────────
  0: {
    0: { questions: [
      { id: "w0m0q1", type: "mcq", prompt: "Which hypervisor is used to host the lab VMs?", options: ["VirtualBox", "VMware ESXi", "Microsoft Hyper-V", "Proxmox"], answerIndex: 0 },
      { id: "w0m0q2", type: "mcq", prompt: "Which IP subnet is the CyberSage_Lab NAT network configured with?", options: ["192.168.1.0/24", "10.0.2.0/24", "172.16.0.0/16", "10.0.0.0/8"], answerIndex: 1 },
    ] },
    1: { questions: [
      { id: "w0m1q1", type: "mcq", prompt: "Which Linux distribution is used as the Red Team (attacker) machine?", options: ["Ubuntu Server", "Debian", "Kali Linux", "CentOS"], answerIndex: 2 },
    ] },
    2: { questions: [
      { id: "w0m2q1", type: "mcq", prompt: "On which port is Kibana accessible after deploying the ELK stack?", options: ["9200", "5044", "5601", "443"], answerIndex: 2 },
      { id: "w0m2q2", type: "mcq", prompt: "What does the ELK stack stand for?", options: ["Elasticsearch, Logstash, Kibana", "Encryption, Logging, Kernel", "Endpoint, Log, Key", "Elastic, Linux, Kafka"], answerIndex: 0 },
    ] },
    3: { questions: [
      { id: "w0m3q1", type: "text", prompt: "Confirm your lab is integrated: which two CyberSage systems should you now be able to log into? (Name them.)" },
    ] },
  },

  // ── Week 1 — Cybersecurity Fundamentals (SOC Basics) ────────────────────────
  1: {
    0: { questions: [
      { id: "w1m0q1", type: "mcq", prompt: "Which OSI layers do SOC analysts primarily focus on when analysing logs?", options: ["Layers 1, 2 and 3", "Layers 3, 4 and 7", "Layers 5, 6 and 7", "All seven equally"], answerIndex: 1 },
      { id: "w1m0q2", type: "mcq", prompt: "Which protocol is connection-oriented and uses a three-way handshake?", options: ["UDP", "ICMP", "TCP", "ARP"], answerIndex: 2 },
      { id: "w1m0q3", type: "mcq", prompt: "Which port is used for HTTPS (encrypted web traffic)?", options: ["80", "22", "53", "443"], answerIndex: 3 },
    ] },
    1: { questions: [
      { id: "w1m1q1", type: "mcq", prompt: "What does DNS translate human-readable domain names into?", options: ["IP addresses", "MAC addresses", "Port numbers", "Hostnames"], answerIndex: 0 },
      { id: "w1m1q2", type: "mcq", prompt: "Which HTTP status code means 'Forbidden / access denied'?", options: ["200", "403", "404", "500"], answerIndex: 1 },
    ] },
    2: { questions: [
      { id: "w1m2q1", type: "mcq", prompt: "Which technology relies on known signatures and only stops known threats?", options: ["EDR", "SIEM", "Antivirus (AV)", "Firewall"], answerIndex: 2 },
      { id: "w1m2q2", type: "mcq", prompt: "What is the primary job of a SIEM?", options: ["Encrypt web traffic", "Aggregate and correlate logs from many sources", "Replace the firewall", "Scan files by signature only"], answerIndex: 1 },
    ] },
    3: { questions: [
      { id: "w1m3q1", type: "mcq", prompt: "What is the classic detection signature of a brute-force attack?", options: ["A single successful login", "Many failed login attempts from one IP in a short time", "High CPU usage", "A 404 error"], answerIndex: 1 },
      { id: "w1m3q2", type: "mcq", prompt: "Which malware type encrypts files and demands payment?", options: ["Spyware", "Trojan", "Ransomware", "Rootkit"], answerIndex: 2 },
    ] },
    4: { questions: [
      { id: "w1m4q1", type: "text", prompt: "In 2–3 sentences: which technologies (Firewall, EDR, SIEM) would detect a brute-force login attack, and what would each see?" },
    ] },
  },

  // ── Week 2 — Blue Team & SOC Operations ─────────────────────────────────────
  2: {
    0: { questions: [
      { id: "w2m0q1", type: "mcq", prompt: "In an auth.log, the same source IP with many failed passwords in quick succession indicates:", options: ["A normal login", "Brute force", "A DNS error", "A patch update"], answerIndex: 1 },
      { id: "w2m0q2", type: "mcq", prompt: "Which log type records who logged in, when, from where, and success/failure?", options: ["Authentication logs", "System logs", "Network logs", "Application logs"], answerIndex: 0 },
    ] },
    1: { questions: [
      { id: "w2m1q1", type: "mcq", prompt: "What is the correct order of the four IR phases?", options: ["Recovery, Detection, Containment, Eradication", "Detection, Containment, Eradication, Recovery", "Containment, Detection, Recovery, Eradication", "Detection, Recovery, Containment, Eradication"], answerIndex: 1 },
      { id: "w2m1q2", type: "mcq", prompt: "Isolating a compromised machine from the network belongs to which phase?", options: ["Detection", "Containment", "Eradication", "Recovery"], answerIndex: 1 },
    ] },
    2: { questions: [
      { id: "w2m2q1", type: "mcq", prompt: "In MITRE ATT&CK, a 'Tactic' represents:", options: ["The attacker's goal", "The specific tool used", "A CVE number", "A firewall rule"], answerIndex: 0 },
      { id: "w2m2q2", type: "mcq", prompt: "Which MITRE ATT&CK technique ID corresponds to Brute Force?", options: ["T1566", "T1059", "T1110", "T1003"], answerIndex: 2 },
    ] },
    3: { questions: [
      { id: "w2m3q1", type: "mcq", prompt: "Threat hunting is best described as:", options: ["Waiting for SIEM alerts to fire", "Proactively searching for attackers before they trigger alerts", "Patching servers", "Writing firewall rules"], answerIndex: 1 },
      { id: "w2m3q2", type: "mcq", prompt: "Which of these is an Indicator of Compromise (IOC)?", options: ["A successful patch", "A known malware file hash", "A normal user login", "A firewall allow rule"], answerIndex: 1 },
    ] },
    4: { questions: [
      { id: "w2m4q1", type: "text", prompt: "Describe how you would identify the attacker's IP address from a log full of failed SSH attempts." },
    ] },
  },

  // ── Week 3 — Red Team Fundamentals ──────────────────────────────────────────
  3: {
    0: { questions: [
      { id: "w3m0q1", type: "mcq", prompt: "OSINT involves gathering information that is:", options: ["Publicly available without touching the target's internal network", "Only from the target's internal servers", "Always encrypted", "Stolen via malware"], answerIndex: 0 },
      { id: "w3m0q2", type: "mcq", prompt: "Which tool harvests emails, names, and subdomains for a domain?", options: ["Wireshark", "theHarvester", "Kibana", "DVWA"], answerIndex: 1 },
    ] },
    1: { questions: [
      { id: "w3m1q1", type: "mcq", prompt: "What does CVE stand for?", options: ["Common Vulnerabilities and Exposures", "Critical Vulnerability Exploit", "Common Virus Engine", "Certified Vulnerability Evaluation"], answerIndex: 0 },
      { id: "w3m1q2", type: "mcq", prompt: "A CVSS base score of 9.0–10.0 is classified as:", options: ["Low", "Medium", "High", "Critical"], answerIndex: 3 },
    ] },
    2: { questions: [
      { id: "w3m2q1", type: "mcq", prompt: "The payload  ' OR 1=1 --  typed into a login field is an example of:", options: ["Cross-Site Scripting", "SQL Injection", "Phishing", "Brute force"], answerIndex: 1 },
      { id: "w3m2q2", type: "mcq", prompt: "Cross-Site Scripting (XSS) executes malicious script in:", options: ["Another user's browser", "The database server", "The firewall", "The DNS resolver"], answerIndex: 0 },
    ] },
    3: { questions: [
      { id: "w3m3q1", type: "mcq", prompt: "Before clicking a link in an email you should:", options: ["Click it quickly", "Hover over it to check the real URL matches the displayed text", "Forward it to colleagues", "Reply asking if it's safe"], answerIndex: 1 },
      { id: "w3m3q2", type: "mcq", prompt: "Which psychological technique does 'Your account will be suspended in 24 hours' use?", options: ["Reward", "Authority", "Urgency", "Curiosity"], answerIndex: 2 },
    ] },
    4: { questions: [
      { id: "w3m4q1", type: "text", prompt: "Briefly outline the stages of an attack chain, from reconnaissance through to impact." },
    ] },
  },

  // ── Week 4 — AI in Cybersecurity (Sentinel & Brain) ─────────────────────────
  4: {
    0: { questions: [
      { id: "w4m0q1", type: "mcq", prompt: "AI in the SOC is best described as:", options: ["A full replacement for analysts", "A force multiplier that triages alerts so analysts focus on what matters", "A type of firewall", "A phishing technique"], answerIndex: 1 },
      { id: "w4m0q2", type: "mcq", prompt: "Which AI application baselines normal behaviour and flags deviations?", options: ["Anomaly detection", "Encryption", "Port scanning", "Patch management"], answerIndex: 0 },
    ] },
    1: { questions: [
      { id: "w4m1q1", type: "mcq", prompt: "What is CyberSage Sentinel?", options: ["A web browser", "A proprietary real-time threat detection engine", "A password manager", "A phishing simulator"], answerIndex: 1 },
      { id: "w4m1q2", type: "mcq", prompt: "In a Sentinel alert, the 'Confidence: 94%' value indicates:", options: ["CPU usage", "How likely the alert is a true positive", "Number of analysts online", "Encryption strength"], answerIndex: 1 },
    ] },
    2: { questions: [
      { id: "w4m2q1", type: "mcq", prompt: "What is the main role of CyberSage Brain?", options: ["Encrypt emails", "Correlate related alerts into a single incident hypothesis", "Host virtual machines", "Block all network traffic"], answerIndex: 1 },
    ] },
    3: { questions: [
      { id: "w4m3q1", type: "text", prompt: "In 2–3 sentences, summarise the most important things you learned across Month 1." },
    ] },
  },
};
