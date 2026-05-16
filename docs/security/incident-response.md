# Incident Response Plan

## 1. Objectives
- Rapidly identify and contain security breaches.
- Minimize data loss and downtime.
- Comply with legal and SOC 2 notification requirements.

## 2. Incident Severity Levels
| Level | Description | Example |
| :--- | :--- | :--- |
| **P0 (Critical)** | Mass data breach, full system outage, PII leak. | Database dump sold online, ransomware. |
| **P1 (High)** | Single account compromise, partial service outage. | Admin account hijack. |
| **P2 (Medium)** | Potential vulnerability detected, suspicious activity. | Brute force attack log spike. |
| **P3 (Low)** | Small bug with no security impact. | Broken CSS. |

## 3. Response Team (IRT)
- **Incident Lead**: CTO
- **Technical Lead**: Lead Developer / DevOps
- **Legal/Comm**: CEO / External Counsel

## 4. Response Workflow
### Phase 1: Identification
- Detection via monitoring (Vercel, Supabase logs), customer reports, or automated scanning.
- **Goal**: Confirm the incident and assign severity.

### Phase 2: Containment
- **Short-term**: Lock down affected accounts, rotate keys, block IP ranges.
- **Long-term**: Patch the vulnerability, re-build affected components.

### Phase 3: Eradication
- Remove the threat (malware, backdoors).
- Verify the root cause is addressed.

### Phase 4: Recovery
- Restore data from backups if needed.
- Monitor traffic for 72 hours for recurrence.

### Phase 5: Lessons Learned
- Conduct a post-mortem within 5 business days.
- Update this plan based on findings.

## 5. Notification Requirements
- **SOC 2**: Document all P0/P1 incidents.
- **Legal/GDPR**: If PII is breached, notify the relevant Data Protection Authority within 72 hours.
- **Customers**: Notify affected customers via email for any P0 incident.
