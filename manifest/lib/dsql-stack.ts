import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as dsql from "aws-cdk-lib/aws-dsql";
import {
  AccountRootPrincipal,
  PolicyDocument,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

export class DsqlStack extends Stack {
  readonly endpoint: string;
  readonly resourceArn: string;
  readonly configPrefix: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.configPrefix = "/chol/prod/bbs";

    const accessPolicy = new PolicyDocument({
      statements: [
        new PolicyStatement({
          principals: [new AccountRootPrincipal()],
          actions: ["dsql:DbConnect", "dsql:DbConnectAdmin"],
          resources: ["*"],
        }),
      ],
    });

    const cluster = new dsql.CfnCluster(this, "Cluster", {
      deletionProtectionEnabled: true,
      policyDocument: Stack.of(this).toJsonString(accessPolicy),
      tags: [
        { key: "Service", value: "chol" },
        { key: "Name", value: "chol" },
      ],
    });

    this.endpoint = cluster.attrEndpoint;
    this.resourceArn = cluster.attrResourceArn;

    new ssm.StringParameter(this, "DsqlHostParameter", {
      parameterName: `${this.configPrefix}/dsql/host`,
      stringValue: this.endpoint,
    });
    new ssm.StringParameter(this, "DsqlUserParameter", {
      parameterName: `${this.configPrefix}/dsql/user`,
      stringValue: "admin",
    });
    new ssm.StringParameter(this, "DsqlDatabaseParameter", {
      parameterName: `${this.configPrefix}/dsql/database`,
      stringValue: "postgres",
    });
    new ssm.StringParameter(this, "DsqlSchemaParameter", {
      parameterName: `${this.configPrefix}/dsql/schema`,
      stringValue: "public",
    });

    new CfnOutput(this, "DsqlEndpoint", {
      exportName: "BbsDsqlEndpoint",
      value: this.endpoint,
    });

    new CfnOutput(this, "DsqlResourceArn", {
      exportName: "BbsDsqlResourceArn",
      value: this.resourceArn,
    });

    new CfnOutput(this, "DsqlConfigPrefix", {
      exportName: "BbsDsqlConfigPrefix",
      value: this.configPrefix,
    });
  }
}
