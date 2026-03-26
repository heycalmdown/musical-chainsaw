import { App, StackProps } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { FaasStack } from "faas-stack";

import * as APIs from "./faas-spec";

const SERVICE = "chol";
const STAGE = "prod";

type LambdaStackProps = StackProps & {
  dsqlConfigPrefix: string;
  dsqlResourceArn: string;
};

export class LambdaStack extends FaasStack {
  constructor(scope: App, id: string, props: LambdaStackProps) {
    super(scope, id, props, SERVICE, STAGE, {
      runtime: Runtime.NODEJS_22_X,
    });

    const commonFunctionProps = {
      environment: {
        BBS_CONFIG_PREFIX: props.dsqlConfigPrefix,
        BBS_CONFIG_REGION: this.region,
        BBS_DSQL_REGION: this.region,
      },
    };

    APIs.Health(this, commonFunctionProps);
    APIs.CreateSession(this, commonFunctionProps);
    APIs.SessionEvent(this, commonFunctionProps);
    APIs.DeleteSession(this, commonFunctionProps);

    const dbConnectPolicy = new PolicyStatement({
      actions: ["dsql:DbConnect", "dsql:DbConnectAdmin"],
      resources: [props.dsqlResourceArn],
    });
    const ssmReadPolicy = new PolicyStatement({
      actions: ["ssm:GetParameters"],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter${props.dsqlConfigPrefix}/*`,
      ],
    });

    for (const func of [
      APIs.CreateSession.func,
      APIs.SessionEvent.func,
      APIs.DeleteSession.func,
    ]) {
      func?.addToRolePolicy(dbConnectPolicy);
      func?.addToRolePolicy(ssmReadPolicy);
    }
  }
}
