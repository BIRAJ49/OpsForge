# Production Cost Controls

Terraform creates an AWS monthly cost budget with a forecast alert at 80 percent and an actual-cost alert at 100 percent. The hardened single-node default is USD 450 and must be reviewed against current regional pricing before apply; it covers the on-demand node, retained storage, recovery copies, and supporting services rather than acting as a cost estimate or cap.

Cloudflare Access and GitHub usage may have separate plan limits. Stopping EC2 reduces compute charges but does not remove EBS, Elastic IP, S3, or other retained-resource charges. `terraform destroy` is not an operational stop procedure because it removes recoverable infrastructure.

Review AWS Cost Explorer monthly and document material changes. The single-node design is a cost decision; EKS, RDS Multi-AZ, and managed observability are deferred until availability requirements justify them.

Do not reduce cost by removing the independent recovery path. The accepted
minimum includes a retained encrypted data volume, six-hour K3s/PostgreSQL
backups in versioned encrypted S3, daily AWS Backup recovery points, and copies
in a second Region. Retention and restore-drill resources have ongoing cost and
belong in the budget. A larger EC2 instance is not a substitute for those
controls and does not change the platform's non-HA classification.
