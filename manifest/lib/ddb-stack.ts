import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AttributeType,
  BillingMode,
  Table,
  StreamViewType,
} from "aws-cdk-lib/aws-dynamodb";
import { tableName } from "../constants";

export class DdbStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "Table", {
      tableName: tableName,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      timeToLiveAttribute: "expiresAt",
    });

    table.addGlobalSecondaryIndex({
      indexName: "GS1",
      partitionKey: { name: "GS1PK", type: AttributeType.STRING },
      sortKey: { name: "GS1SK", type: AttributeType.STRING },
    });
  }
}
