import { App, CfnOutput, Fn, Stack, StackProps } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Bucket } from "aws-cdk-lib/aws-s3";
import path from "node:path";

const certificateArn = process.env.CERTIFICATE_ARN!;
if (!certificateArn) {
  throw new Error(
    "Missing CERTIFICATE_ARN. Set it in manifest/.env or the environment before running CDK.",
  );
}

export type CloudFrontStackProps = StackProps & {
  hostedZoneDomainName: string;
  siteDomainName: string;
};

export class CloudFrontStack extends Stack {
  constructor(scope: App, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, "ImportedHostedZone", {
      domainName: props.hostedZoneDomainName,
    });
    const bucket = Bucket.fromBucketName(
      this,
      "ImportedBucket",
      Fn.importValue("CholBucketName"),
    );
    const certificate = Certificate.fromCertificateArn(
      this,
      "ImportedCertificate",
      certificateArn,
    );
    const urlRewriteFunction = new CloudFrontFunction(
      this,
      "UrlRewriteFunction",
      {
        functionName: "faas-chol-frontend-url-rewrite",
        runtime: FunctionRuntime.JS_2_0,
        comment: "Rewrite app routes to index.html",
        code: FunctionCode.fromFile({
          filePath: path.join(__dirname, "url-rewrite-function.js"),
        }),
      },
    );

    const distribution = new Distribution(this, "Distribution", {
      certificate,
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [
          {
            function: urlRewriteFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [props.siteDomainName],
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    new ARecord(this, "SiteAliasRecord", {
      zone: hostedZone,
      recordName: props.siteDomainName.replace(
        `.${props.hostedZoneDomainName}`,
        "",
      ),
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new CfnOutput(this, "DistributionId", {
      exportName: "CholFrontendDistributionId",
      value: distribution.distributionId,
    });

    new CfnOutput(this, "DistributionDomainName", {
      exportName: "CholFrontendDistributionDomainName",
      value: distribution.domainName,
    });

    new CfnOutput(this, "FrontendUrl", {
      exportName: "CholFrontendUrl",
      value: `https://${props.siteDomainName}`,
    });
  }
}
