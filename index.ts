import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// Import the program's configuration settings.
const config = new pulumi.Config();
const machineType = config.get("machineType") || "e2-micro";
const osImage = config.get("osImage") || "debian-11";
const instanceTagMaster = config.get("instanceTagMaster") || "master1";
const instanceTagReplica = config.get("instanceTagReplica") || "replica1";
const servicePorts = config.get("servicePorts") || '5432-5435';
const sshKeys = config.get("sshKeys") || '';

// Create a new network for the virtual machine.
const network = new gcp.compute.Network("network", {
  autoCreateSubnetworks: false,
});

// Create a subnet on the network.
const subnet = new gcp.compute.Subnetwork("subnet", {
  ipCidrRange: "10.0.1.0/24",
  network: network.id,
});

// Create a firewall allowing inbound access over ports 80 (for HTTP) and 22 (for SSH).
const sshFirewallRule = new gcp.compute.Firewall("ssh", {
  network: network.selfLink,
  allows: [
    {
      protocol: "tcp",
      ports: ["22"],
    },
  ],
  direction: "INGRESS",
  sourceRanges: ["0.0.0.0/0"],
  targetTags: [instanceTagMaster, instanceTagReplica],
});

// Create a firewall allowing inbound access over ports 80 (for HTTP) and 22 (for SSH).
const postgresFirewallRule = new gcp.compute.Firewall("postgres", {
  network: network.selfLink,
  allows: [
    {
      protocol: "tcp",
      ports: [servicePorts],
    },
  ],
  direction: "INGRESS",
  sourceRanges: [subnet.ipCidrRange],
  targetTags: [instanceTagMaster, instanceTagReplica],
});

const egressFirewallRule = new gcp.compute.Firewall("egress", {
  network: network.selfLink,
  allows: [
    {
      protocol: "tcp",
      ports: ["1024-65000"],
    },
  ],
  direction: "EGRESS",
  targetTags: [instanceTagMaster, instanceTagReplica],
});

const masterInstance = new gcp.compute.Instance(
  "master",
  {
    machineType,
    bootDisk: {
      initializeParams: {
        image: osImage,
      },
    },
    networkInterfaces: [
      {
        network: network.id,
        subnetwork: subnet.id,
        accessConfigs: [{}],
      },
    ],
    serviceAccount: {
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
    allowStoppingForUpdate: true,
    tags: [instanceTagMaster],
    metadata: {
      "ssh-keys": sshKeys,
    },
  },
  { dependsOn: [sshFirewallRule, postgresFirewallRule, egressFirewallRule] },
);

const replicaInstance = new gcp.compute.Instance(
  "replica",
  {
    machineType,
    bootDisk: {
      initializeParams: {
        image: osImage,
      },
    },
    networkInterfaces: [
      {
        network: network.id,
        subnetwork: subnet.id,
        accessConfigs: [{}],
      },
    ],
    serviceAccount: {
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
    allowStoppingForUpdate: true,
    tags: [instanceTagReplica],
    metadata: {
      "ssh-keys": sshKeys,
    },
  },
  { dependsOn: [sshFirewallRule, postgresFirewallRule, egressFirewallRule] },
);

const masterIp_ = masterInstance.networkInterfaces.apply((interfaces) => {
  return interfaces[0].accessConfigs![0].natIp;
});

const replicaIp_ = replicaInstance.networkInterfaces.apply((interfaces) => {
  return interfaces[0].accessConfigs![0].natIp;
});

export const master = masterInstance.name;
export const masterIp = masterIp_;
export const replica = replicaInstance.name;
export const replicaIp = replicaIp_;
