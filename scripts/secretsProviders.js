/**
 * Secret provider abstraction layer for cloud services.
 * This module provides a clean interface for retrieving secrets from various cloud providers,
 * with support for dependency injection to enable easy testing and mocking.
 *
 * @file scripts/secretsProviders.js
 * @module scripts/secretsProviders
 */

const { execSync } = require('child_process');

/**
 * Retrieve a secret from Google Cloud Secret Manager.
 * @param {string} project - The GCP project ID
 * @param {string} secretName - The name of the secret
 * @returns {string} The secret value
 * @throws {Error} If the gcloud command fails
 */
function getGcpSecret(project, secretName) {
	const gcpCommand = `gcloud secrets versions access latest --secret="${secretName}" --project="${project}"`;
	return execSync(gcpCommand, { encoding: 'utf8' });
}

/**
 * Retrieve a secret from Azure Key Vault.
 * @param {string} vaultName - The Key Vault name
 * @param {string} secretName - The name of the secret
 * @returns {string} The secret value
 * @throws {Error} If the az command fails
 */
function getAzureSecret(vaultName, secretName) {
	const azureCommand = `az keyvault secret show --vault-name "${vaultName}" --name "${secretName}" --query value --output tsv`;
	return execSync(azureCommand, { encoding: 'utf8' });
}

/**
 * Retrieve a secret from AWS Secrets Manager.
 * @param {string} region - The AWS region
 * @param {string} secretName - The name/ARN of the secret
 * @returns {string} The secret value
 * @throws {Error} If the aws command fails
 */
function getAwsSecret(region, secretName) {
	const awsCommand = `aws secretsmanager get-secret-value --region "${region}" --secret-id "${secretName}" --query SecretString --output text`;
	return execSync(awsCommand, { encoding: 'utf8' });
}

/**
 * Default secret providers object for easy injection.
 * This object can be easily replaced with mocks during testing.
 */
const defaultProviders = {
	getGcpSecret,
	getAzureSecret,
	getAwsSecret
};

module.exports = {
	getGcpSecret,
	getAzureSecret,
	getAwsSecret,
	defaultProviders
};