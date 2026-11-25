# One-time setup: send assignment mails through Azure Communication Services using Azure's free
# managed domain. No domain or DNS records are needed; mails come from
# DoNotReply@<...>.azurecomm.net (limit: 5 mails per minute, 10 per hour).
#
# Prerequisite: the Microsoft.Communication resource provider must be registered on the
# subscription. A subscription admin does this once:
#   az provider register -n Microsoft.Communication
#
# Usage (after az login, from this folder):
#   .\setup-acs.ps1
param(
  [string]$ResourceGroup = 'rg-MURAT',
  [string]$FunctionApp = 'task-manager-notify-wf3n2h',
  [string]$EmailService = 'task-manager-email',
  [string]$CommService = 'task-manager-acs',
  [string]$DataLocation = 'Europe'
)
$ErrorActionPreference = 'Stop'

function Invoke-Az {
  $out = & az @args
  if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') failed." }
  $out
}

if ((az provider show -n Microsoft.Communication --query registrationState -o tsv) -ne 'Registered') {
  throw 'Microsoft.Communication is not registered. Ask a subscription admin to run: az provider register -n Microsoft.Communication'
}
az extension show -n communication -o none 2>$null
if ($LASTEXITCODE -ne 0) { Invoke-Az extension add -n communication --yes | Out-Null }

Write-Host 'Creating the email service and the Azure managed domain...'
Invoke-Az communication email create -n $EmailService -g $ResourceGroup --location global --data-location $DataLocation -o none
Invoke-Az communication email domain create --domain-name AzureManagedDomain --email-service-name $EmailService -g $ResourceGroup --location global --domain-management AzureManaged -o none
$domainId = Invoke-Az communication email domain show --domain-name AzureManagedDomain --email-service-name $EmailService -g $ResourceGroup --query id -o tsv
$senderDomain = Invoke-Az communication email domain show --domain-name AzureManagedDomain --email-service-name $EmailService -g $ResourceGroup --query mailFromSenderDomain -o tsv

Write-Host 'Creating the Communication Services resource and linking the domain...'
Invoke-Az communication create -n $CommService -g $ResourceGroup --location global --data-location $DataLocation --linked-domains $domainId -o none
$conn = Invoke-Az communication list-key -n $CommService -g $ResourceGroup --query primaryConnectionString -o tsv

Write-Host 'Updating the Function App settings...'
$file = Join-Path $env:TEMP ('acs-settings-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  $json = @{ ACS_CONNECTION_STRING = $conn; MAIL_FROM = "DoNotReply@$senderDomain" } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($file, $json, (New-Object Text.UTF8Encoding $false))
  Invoke-Az functionapp config appsettings set -g $ResourceGroup -n $FunctionApp --settings "@$file" -o none
} finally {
  Remove-Item $file -Force -ErrorAction SilentlyContinue
}
# Remove the test redirect: mails now go to the task owners.
az functionapp config appsettings delete -g $ResourceGroup -n $FunctionApp --setting-names MAIL_REDIRECT_TO -o none 2>$null

Write-Host "Done. Sender address: DoNotReply@$senderDomain"
