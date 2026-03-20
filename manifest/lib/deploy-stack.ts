import { Stack, App, StackProps, Fn } from "aws-cdk-lib";
import {
  RestApi,
  Stage,
  Deployment,
  IDomainName,
  BasePathMapping,
  IRestApi,
  DomainName,
} from "aws-cdk-lib/aws-apigateway";

const API_DOMAIN_NAME = "api.kson.live";

export class DeployStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const api = this.findGateway();
    const deployment = this.createDeployment(api);
    const stage = this.createStage(deployment);
    api.deploymentStage = stage;

    const domainName = this.findCustomDomainName();
    this.createApiMapping(domainName, api);
  }

  findCustomDomainName() {
    return DomainName.fromDomainNameAttributes(this, "ImportedDomain", {
      domainName: API_DOMAIN_NAME,
      domainNameAliasTarget: Fn.importValue("kApiDomainAliasTarget"),
      domainNameAliasHostedZoneId: Fn.importValue(
        "kApiDomainAliasHostedZoneId",
      ),
    });
  }

  createApiMapping(domainName: IDomainName, apiGateway: IRestApi) {
    return new BasePathMapping(this, "PathMapping", {
      domainName,
      restApi: apiGateway,
    });
  }

  findGateway() {
    return RestApi.fromRestApiAttributes(this, "ImportedGateway", {
      restApiId: Fn.importValue("PublicGatewayId"),
      rootResourceId: Fn.importValue("PublicGatewayRootResourceId"),
    });
  }

  createDeployment(api: IRestApi) {
    const now = new Date();
    return new Deployment(this, "Deployment" + now.toISOString(), {
      api,
      description: `${new Date()}`,
    });
  }

  createStage(deployment: Deployment) {
    return new Stage(this, "Prod", {
      stageName: "prod",
      deployment,
      cachingEnabled: false,
      // cacheTtl: Duration.seconds(0),
      // cacheClusterEnabled: true,
      // cacheClusterSize: '0.5',
      // methodOptions: {
      //   '/vendor/{vendorId}/country-code/GET': {
      //     cachingEnabled: true,
      //     cacheTtl: Duration.minutes(1),
      //   },
      // },
    });
  }
}
