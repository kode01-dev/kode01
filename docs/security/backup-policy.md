# Backup & Disaster Recovery Policy

## Overview
This document outlines the backup and disaster recovery procedures for the platform to ensure data integrity and availability in accordance with SOC 2 standards.

## RPO & RTO
- **Recovery Point Objective (RPO)**: 24 hours. No more than 24 hours of data should be lost in the event of a total failure.
- **Recovery Time Objective (RTO)**: 4 hours. The primary database should be restored and operational within 4 hours of disaster declaration.

## Backup Strategy
- **Location**: All critical application data resides in Supabase (PostgreSQL).
- **Automated Backups**: 
  - Daily full backups are performed automatically by Supabase.
  - Retention period: 30 days.
  - **Off-site Redundancy**: Use [supabase-backup](https://github.com/olirice/supabase-backup) to mirror backups to an external S3 bucket (AWS/Backblaze) weekly to meet strict SOC 2 physical separation requirements.
- **Storage**: Backups are stored in multiple geographically redundant data centers by Supabase.

## 5. Notification Requirements
- **SOC 2**: Document all P0/P1 incidents using the [Practical Assurance SOC 2 Project](https://github.com/practical-assurance/soc2-project) templates for evidence collection.
- **Legal/GDPR**: If PII is breached, notify the relevant Data Protection Authority within 72 hours.
- **Customers**: Notify affected customers via email for any P0 incident.

## Restoration Testing
- **Frequency**: Every 6 months.
- **Procedure**:
  1. Initialize a new temporary Supabase project.
  2. Request a restore of the latest production backup to the temporary project.
  3. Verify data integrity (e.g., matching row counts in `profiles` and `audit_logs`).
  4. Document the success/failure and time taken for restoration.

## Disaster Recovery Procedure
1. **Identification**: DevOps/CTO identifies a catastrophic data failure.
2. **Declaration**: CEO/CTO declares a disaster scenario.
3. **Restoration**: 
  - If a specific project is corrupted, use the Supabase Restore UI or API.
  - If the provider (Supabase) is globally down, activate the secondary region replica (if configured) or wait for provider resolution as per SLA.
4. **Validation**: Test critical app paths after restoration.
5. **Notification**: Notify users if data loss occurs or downtime exceeds 30 minutes.
