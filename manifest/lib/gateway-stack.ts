import { App, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { EndpointType, RestApi, DomainName } from "aws-cdk-lib/aws-apigateway";
import { Certificate, ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayv2DomainProperties } from "aws-cdk-lib/aws-route53-targets";

const API_DOMAIN_NAME = "api.kson.live";

export class GatewayStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const apiGateway = this.createApiGateway();
    const certificate = this.findCertificate();
    const domainName = this.createCustomDomainName(certificate);
    this.createARecord(domainName);

    this.createOutput("PublicGatewayId", apiGateway.restApiId);
    this.createOutput(
      "PublicGatewayRootResourceId",
      apiGateway.restApiRootResourceId,
    );
    this.createOutput(
      "kApiDomainAliasTarget",
      domainName.domainNameAliasDomainName,
    );
    this.createOutput(
      "kApiDomainAliasHostedZoneId",
      domainName.domainNameAliasHostedZoneId,
    );
  }

  createOutput(exportName: string, value: string) {
    new CfnOutput(this, exportName, { exportName, value });
  }

  createApiGateway() {
    return new RestApi(this, "kApi", {
      description: API_DOMAIN_NAME,
      deploy: false,
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
      binaryMediaTypes: ["multipart/form-data"],
      // 👇 enable CORS
      defaultCorsPreflightOptions: {
        allowHeaders: ["*"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });
  }

  findCertificate() {
    return Certificate.fromCertificateArn(
      this,
      "kAcm",
      "arn:aws:acm:ap-northeast-2:472696305832:certificate/37be7786-c0b3-4e49-8efc-218bd3b7d236",
    );
  }

  createCustomDomainName(certificate: ICertificate) {
    return new DomainName(this, "ApiDomain", {
      domainName: API_DOMAIN_NAME,
      certificate,
    });
  }

  createARecord(domainName: DomainName) {
    const hostedZone = HostedZone.fromLookup(this, "ImportedHostedZone", {
      domainName: "kson.live",
    });

    new ARecord(this, "ApiKsonLive", {
      zone: hostedZone,
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(
          domainName.domainNameAliasDomainName,
          domainName.domainNameAliasHostedZoneId,
        ),
      ),
      recordName: "api",
    });
  }
}
