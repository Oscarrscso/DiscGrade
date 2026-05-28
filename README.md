# DiscGrade

DiscGrade is a Stremio/Fusion addon.

It checks disc-release websites and shows a movie or TV show's useful disc information inside Stremio/Fusion:

- recommended edition
- best video release
- best audio release
- commentary tracks when DiscGrade can find them
- all releases found by the sources
- streaming availability when no disc data is found
- debug information showing which websites were checked

The important link is the addon manifest (example link, doesn't work):

```txt
https://your-discgrade-site/manifest.json
```

That is the link you add to Stremio or Fusion.

## The Simple Version

You will do this:

1. Install the tools that let your computer build and upload DiscGrade.
2. Give your computer permission to upload to your AWS account.
3. Run one deploy command.
4. Copy the printed `manifest.json` link into Stremio or Fusion.

AWS keeps DiscGrade online after your computer is shut down.

Docker Desktop does not need to run forever. It only needs to be open while you deploy.

## What You Need To Install

Install these on your computer before deploying.

### 1. Docker Desktop

Docker Desktop builds the DiscGrade app into a container.

A container is a packaged version of the app that AWS can run.

Install it from:

```txt
https://www.docker.com/products/docker-desktop/
```

After installing Docker Desktop, open it once. Wait until it says Docker is running.

### 2. AWS CLI v2

AWS CLI lets Terminal talk to your AWS account.

Install it from:

```txt
https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
```

On Mac, open Terminal and check it works:

```bash
aws --version
```

On Windows, open PowerShell and check it works:

```powershell
aws --version
```

The result should start with:

```txt
aws-cli/2
```

### 3. lightsailctl

`lightsailctl` lets AWS Lightsail receive the container that Docker builds.

Install it from:

```txt
https://lightsail.aws.amazon.com/ls/docs/en_us/articles/amazon-lightsail-install-software
```

On Mac, open Terminal and check it works:

```bash
lightsailctl --version
```

On Windows, open PowerShell and check it works:

```powershell
lightsailctl --version
```

### 4. Node.js

Node.js lets the deploy script create the AWS deployment files.

Install the current LTS version from:

```txt
https://nodejs.org/
```

On Mac, open Terminal and check it works:

```bash
node --version
```

On Windows, open PowerShell and check it works:

```powershell
node --version
```

### 5. Git For Windows

Windows needs Git for Windows because this project deploys with a Bash script.

Bash is the command runner used by the deploy script.

Install Git for Windows from:

```txt
https://git-scm.com/download/win
```

After installing it, open the Windows Start menu and search for:

```txt
Git Bash
```

Use Git Bash for the deploy commands in this README.

Mac already includes a compatible shell, so Mac users do not need this extra step.

## Give Your Computer Access To AWS

In AWS, create an access key for your IAM user.

Your computer needs two values:

- Access Key ID
- Secret Access Key

The Secret Access Key is private. Do not paste it into GitHub. Do not put it in this project.

On Mac, open Terminal and run:

```bash
aws configure
```

On Windows, open PowerShell and run:

```powershell
aws configure
```

AWS CLI will ask four questions.

For `AWS Access Key ID`, paste your Access Key ID.

For `AWS Secret Access Key`, paste your Secret Access Key.

For `Default region name`, type:

```txt
eu-west-1
```

For `Default output format`, type:

```txt
json
```

This stores the AWS login on your computer for AWS CLI. It does not add the key to the project folder.

## Deploy DiscGrade To AWS Lightsail

Make sure Docker Desktop is open and running before you deploy.

### Mac Deploy Command

Open Terminal.

Go into the DiscGrade project folder:

```bash
cd ~/DiscGrade
```

Run the deploy script:

```bash
bash scripts/lightsail-deploy.sh
```

### Windows Deploy Command

Open Git Bash.

Go into the DiscGrade project folder.

If the project is in your Windows user folder, the command will look like this:

```bash
cd ~/DiscGrade
```

If you downloaded the repo somewhere else, right-click the project folder in File Explorer, choose `Open Git Bash here`, then run the deploy command:

```bash
bash scripts/lightsail-deploy.sh
```

The script does these jobs:

- creates an AWS Lightsail container service called `discgrade` if it does not already exist
- builds the DiscGrade container on your computer
- uploads the container to AWS Lightsail
- starts the new version on AWS
- prints the public website link
- prints the `manifest.json` addon link

When it finishes, look for a line like this:

```txt
Manifest URL: https://example.amazonaws.com/manifest.json
```

Copy that full `Manifest URL`.

## Add DiscGrade To Stremio Or Fusion

Open Stremio or Fusion.

Find the place where you add an addon by URL.

Paste the full `manifest.json` URL.

Example:

```txt
https://discgrade.example.com/manifest.json
```

After adding it, DiscGrade should appear as an addon tab/card for supported movies and TV shows.

## Check That It Is Online

Open your `manifest.json` link in a browser.

If the browser shows text starting with `{`, the addon is online.

Open this test guide page, replacing the first part with your own AWS URL:

```txt
https://your-discgrade-site/guide/tt0056592
```

If the guide page opens, the hosted app is working.

## Update DiscGrade Later

When the code changes and you want the hosted version to update, run the same deploy command again:

Mac:

```bash
cd ~/DiscGrade
bash scripts/lightsail-deploy.sh
```

Windows, inside Git Bash:

```bash
cd ~/DiscGrade
bash scripts/lightsail-deploy.sh
```

You do not need to create a new Lightsail service.

The script reuses the existing `discgrade` service and replaces the running app with the new version.

## Stop The AWS Service

AWS charges for the Lightsail service while it exists.

To delete the service, run:

Mac Terminal:

```bash
aws lightsail delete-container-service \
  --region eu-west-1 \
  --service-name discgrade
```

Windows PowerShell:

```powershell
aws lightsail delete-container-service --region eu-west-1 --service-name discgrade
```

After this command succeeds, the old `manifest.json` link stops working.

## Private Settings

Private settings are values that belong only to you.

Examples:

- AWS Access Key ID
- AWS Secret Access Key
- admin tokens
- private API keys
- private server URLs

Do not upload private settings to GitHub.

This project includes `.env.example` only as a list of setting names. It does not contain real secrets.

You do not need to create a `.env` file to deploy DiscGrade with the default settings.

If you do create a `.env` file later, keep it on your computer only. The `.gitignore` file is set up so `.env` files are not committed.

## Useful Local Test

If you want to run DiscGrade on your computer without AWS, use the commands below.

Mac Terminal:

```bash
cd ~/DiscGrade
node --experimental-strip-types src/server.ts
```

Windows PowerShell:

```powershell
cd $HOME\DiscGrade
node --experimental-strip-types src/server.ts
```

Then open:

```txt
http://localhost:7000/manifest.json
```

Local testing only runs on your own computer. Stremio/Fusion on another device needs the AWS `manifest.json` link.
