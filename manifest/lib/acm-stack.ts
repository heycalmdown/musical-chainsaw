import { App, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";

type AcmStackProps = StackProps & {
  hostedZoneDomainName: string;
  siteDomainName: string;
};

export class AcmStack extends Stack {
  constructor(scope: App, id: string, props: AcmStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, "ImportedHostedZone", {
      domainName: props.hostedZoneDomainName,
    });

    const certificate = new Certificate(this, "Certificate", {
      domainName: props.siteDomainName,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    new CfnOutput(this, "CertificateArn", {
      exportName: "CholCertificateArn",
      value: certificate.certificateArn,
    });
  }
}
