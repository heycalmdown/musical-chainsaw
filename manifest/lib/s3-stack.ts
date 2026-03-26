import {
  App,
  CfnOutput,
  RemovalPolicy,
  Size,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import path from "node:path";

export class S3Stack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, "S3Bucket", {
      bucketName: "faas-chol",
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    bucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
        conditions: {
          StringLike: {
            "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/*`,
          },
        },
      }),
    );

    new BucketDeployment(this, "Deployment", {
      destinationBucket: bucket,
      exclude: [".DS_Store", "Thumbs.db"],
      memoryLimit: 3008,
      ephemeralStorageSize: Size.gibibytes(10),
      prune: true,
      retainOnDelete: false,
      sources: [Source.asset(path.resolve(__dirname, "..", "..", "dist"))],
    });

    new CfnOutput(this, "BucketName", {
      exportName: "CholBucketName",
      value: bucket.bucketName,
    });
  }
}
