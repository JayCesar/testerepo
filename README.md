{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
      ],
      "Effect": "Allow",
      "Resource": "*"
    },
    {
      "Action": [
        "ecs:DescribeClusters",
        "ecs:DescribeServices",
        "ecs:ListClusters",
        "ecs:ListServices",
        "ecs:UpdateService",
        "ecs:ListTagsForResource"
      ],
      "Effect": "Allow",
      "Resource": "*"
    },
    {
      "Action": [
        "application-autoscaling:RegisterScalableTarget",
        "application-autoscaling:DescribeScalableTargets"
      ],
      "Effect": "Allow",
      "Resource": "*"
    }
  ]
}
