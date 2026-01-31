#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { pascalCase } from "es-toolkit";

import { DdbStack } from "../lib/ddb-stack";
import { SERVICE } from "../constants";

const app = new App();
const props = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};
new DdbStack(app, `${pascalCase(SERVICE)}Ddb`, props);
