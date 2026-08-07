# Production Cost Controls

Terraform creates an AWS monthly cost budget with a forecast alert at 80 percent and an actual-cost alert at 100 percent. The default threshold is USD 50 and should be adjusted to the account's expected EC2, EBS, Elastic IP, S3, data transfer, and DNS usage.

Cloudflare Access and GitHub usage may have separate plan limits. Stopping EC2 reduces compute charges but does not remove EBS, Elastic IP, S3, or other retained-resource charges. `terraform destroy` is not an operational stop procedure because it removes recoverable infrastructure.

Review AWS Cost Explorer monthly and document material changes. The single-node design is a cost decision; EKS, RDS Multi-AZ, and managed observability are deferred until availability requirements justify them.
