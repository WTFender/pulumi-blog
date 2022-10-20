import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as synced_folder from "@pulumi/synced-folder";
import { CreateCert } from "./cert"


// Import the program's configuration settings.
const config = new pulumi.Config();
const dirPath = config.require("dirPath")
const dnsZoneId = config.require("dnsZoneId")
const domainName = config.require("domainName")
const altDomainNames = config.get("altDomainNames") || ""
const indexDocument = config.get("indexDocument") || "index.html";
const errorDocument = config.get("errorDocument") || "error.html";

// Create an S3 bucket
const bucket = new aws.s3.Bucket(domainName);

// Create origin permissions
const oai = new aws.cloudfront.OriginAccessIdentity("cdn-s3", {
    comment: "cdn s3 permissions",
});

// Restrict bucket to cloudfront
const iamPolicy = aws.iam.getPolicyDocumentOutput({
    statements: [{
        actions: ["s3:GetObject"],
        resources: [pulumi.interpolate`${bucket.arn}/*`],
        principals: [{
            type: "AWS",
            identifiers: [oai.iamArn],
        }],
    }],
});

const bucketPolicy = new aws.s3.BucketPolicy("pol-cdn-s3", {
    bucket: bucket.id,
    policy: iamPolicy.json,
});

// Use a synced folder to manage the files of the website.
const bucketFolder = new synced_folder.S3BucketFolder("/", {
    path: dirPath,
    bucketName: bucket.bucket,
    acl: "private",
});

// Create Certificate and validation
const cert = CreateCert(domainName, altDomainNames.split(','), dnsZoneId, true)

// Create CloudFront CDN
const cdn = new aws.cloudfront.Distribution(domainName, {
    enabled: true,
    aliases: [domainName].concat(altDomainNames.split(',')),
    origins: [{
        domainName: bucket.bucketDomainName,
        originId: bucket.arn,
        s3OriginConfig: {
            originAccessIdentity: oai.cloudfrontAccessIdentityPath,
        },
    }],
    defaultCacheBehavior: {
        targetOriginId: bucket.arn,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
        ],
        cachedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
        ],
        defaultTtl: 600,
        maxTtl: 600,
        minTtl: 600,
        forwardedValues: {
            queryString: true,
            cookies: {
                forward: "all",
            },
        },
    },
    priceClass: "PriceClass_100",
    defaultRootObject: `/${indexDocument}`,
    customErrorResponses: [{
        errorCode: 404,
        responseCode: 404,
        responsePagePath: `/${errorDocument}`,
    }],
    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },
    viewerCertificate: {
        acmCertificateArn: cert.arn,
        sslSupportMethod: 'sni-only'
    },
});


// Export the URLs and hostnames of the bucket and distribution.
export const bucketName = bucket.bucket;
export const cdnURL = pulumi.interpolate`https://${cdn.domainName}`;