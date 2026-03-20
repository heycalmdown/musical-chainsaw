#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { pascalCase } from "es-toolkit";

import { DsqlStack } from "../lib/dsql-stack";
import { GatewayStack } from "../lib/gateway-stack";
import { LambdaStack } from "../lib/lambda-stack";
import { SERVICE } from "../constants";
import { DeployStack } from "../lib/deploy-stack";

const app = new App();
const props = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
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
