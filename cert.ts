import * as acm from "@pulumi/aws/acm";
import * as r53 from "@pulumi/aws/route53";

export function CreateCert(domainName: string, altDomainNames: Array<string>, dnsZoneId: string, validate=false): acm.Certificate {

    // Create certificate and validation entries
    const cert = new acm.Certificate("cert-"+domainName, {
        domainName: domainName,
        subjectAlternativeNames: altDomainNames,
        validationMethod: "DNS",
    });
    
    if (validate){
        const certValidation = new r53.Record("validation-r53", {
            name: cert.domainValidationOptions[0].resourceRecordName,
            records: [cert.domainValidationOptions[0].resourceRecordValue],
            ttl: 60,
            type: cert.domainValidationOptions[0].resourceRecordType,
            zoneId: dnsZoneId,
        });

        const certCertificateValidation = new acm.CertificateValidation("validation-cert", {
            certificateArn: cert.arn,
            validationRecordFqdns: [certValidation.fqdn],
        });
    }

    return cert
}