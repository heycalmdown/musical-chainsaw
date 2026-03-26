#!/usr/bin/env node
import "dotenv/config";
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { pascalCase } from "es-toolkit";

import { DsqlStack } from "../lib/dsql-stack";
import { GatewayStack } from "../lib/gateway-stack";
import { LambdaStack } from "../lib/lambda-stack";
import { SERVICE } from "../constants";
import { DeployStack } from "../lib/deploy-stack";
import { AcmStack } from "../lib/acm-stack";
import { S3Stack } from "../lib/s3-stack";
import { CloudFrontStack } from "../lib/cloudfront-stack";

const app = new App();
const hostedZoneDomainName = "kson.live";
const siteDomainName = `bbs.${hostedZoneDomainName}`;

const props = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};
const acmProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
};
new GatewayStack(app, `kGateway`, props);
new DeployStack(app, `kDeployment`, props);
const dsqlStack = new DsqlStack(app, `${pascalCase(SERVICE)}Dsql`, props);
new LambdaStack(app, `${pascalCase(SERVICE)}Lambda`, {
  ...props,
  dsqlConfigPrefix: dsqlStack.configPrefix,
  dsqlResourceArn: dsqlStack.resourceArn,
});
new AcmStack(app, `${pascalCase(SERVICE)}Acm`, {
  ...acmProps,
  hostedZoneDomainName,
  siteDomainName,
});
new S3Stack(app, `${pascalCase(SERVICE)}S3`, props);
new CloudFrontStack(app, `${pascalCase(SERVICE)}CloudFront`, {
  ...props,
  hostedZoneDomainName,
  siteDomainName,
});
