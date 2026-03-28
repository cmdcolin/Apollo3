# Deploying on an Ubuntu server

## Prerequisites

- An Ubuntu server
  - Need terminal (SSH) and HTTP(S) access
  - This guide was written using Ubuntu 24.04.2
- A domain name for the server
  - This guide assumes you are using the top level of the domain, so e.g. if
    your domain name is `example.com`, you won't be able to have Apollo be at
    `example.com/apollo`. Subdomains are fine, though, so you could use
    `apollo.example.com`

## Set up JBrowse

Before installing anything, just to make sure the repositories are up to date,
run

```sh
sudo apt update
```

Now install the tools we need by running

```sh
sudo apt install -y apache2 unzip
```

This installs:

- apache2, which is the web server we'll use to server JBrowse
- unzip, for decompressing the JBrowse installation files

By default, apache2 serves files located in the `/var/www/html` directory. We'll
add permissions for our user to access that directory and then set up the
JBrowse files there.

```sh
sudo chown -R $(whoami) /var/www/html/
cd /var/www/html/
rm index.html
curl -fsSL https://s3.amazonaws.com/jbrowse.org/code/jb2/latest/jbrowse-web-latest.zip > jbrowse-web.zip
unzip jbrowse-web.zip
rm jbrowse-web.zip
sudo systemctl restart apache2.service
```

Now open the URL of your server. You should see a screen that says "It worked!".
If so, JBrowse has been successfully installed.

![Screen showing "It worked!" message](jbrowse_it_worked.png)

## Set up Apollo JBrowse plugin

To add the Apollo plugin, we'll first fetch the plugin source file and place it
in a file called `apollo.js` in the directory with the other JBrowse files.

```sh
curl -fsSL https://registry.npmjs.org/@apollo-annotation/jbrowse-plugin-apollo/ > jpa.json
LATEST_VERSION=$(jq -r '."dist-tags".latest' jpa.json)
TARBALL_URL=$(jq -r ".versions.\"${LATEST_VERSION}\".dist.tarball" jpa.json)
curl -fsSL ${TARBALL_URL} | \
  tar --extract --gzip --file=- --strip=2 package/dist/jbrowse-plugin-apollo.umd.production.min.js
mv jbrowse-plugin-apollo.umd.production.min.js apollo.js
rm jpa.json
```

In order to test that this worked, we'll need to create a temporary JBrowse
config file. We'll use the text editor `nano` in this tutorial, but feel free to
use whatever text editor you like.

First install `nano` and use it to open a file

```sh
sudo apt install -y nano
nano config.json
```

That will open the `nano` editor. Paste or type the following into the file:

```json
{
  "plugins": [
    {
      "name": "Apollo",
      "url": "apollo.js"
    }
  ]
}
```

To save the file, press <kbd>Ctrl</kbd> + <kbd>O</kbd> and then
<kbd>Enter</kbd>, and to exit `nano`, press <kbd>Ctrl</kbd> + <kbd>X</kbd>.

Now open the same link as before (or refresh the page). You should now see the
JBrowse start screen. Choose an "Empty" session.

![JBrowse start screen](jbrowse_start_screen.png)

If Apollo has been installed successfully, you'll see a menu called "Apollo" at
the top of the page.

![Menu bar of JBrowse with an "Apollo" menu](apollo_top_menu.png)

You can use some basic Apollo functionality like editing annotations in small
local GFF3 files with just the plugin, but to enable the full functionality of
Apollo we'll need to add the last two components. Delete the `config.json` for
now, as we won't need it anymore.

```sh
rm config.json
```

## Set up the database

Apollo supports PostgreSQL (recommended for production), SQLite (for development
and demos), and MongoDB (for backward compatibility). In this example we'll set
up PostgreSQL running on the same server as everything else, but it could just
as easily be an externally managed database.

Install PostgreSQL:

```sh
sudo apt install -y postgresql
```

Now create a database and user for Apollo:

```sh
sudo -u postgres createuser apollo
sudo -u postgres createdb -O apollo apollo
sudo -u postgres psql -c "ALTER USER apollo WITH PASSWORD 'your-secure-password';"
```

PostgreSQL should already be running after installation. You can verify with:

```sh
sudo systemctl status postgresql
```

:::note Alternative: MongoDB

If you prefer to use MongoDB (for example, to maintain compatibility with an
existing deployment), install MongoDB and set `DB_BACKEND=mongo` and
`MONGODB_URI` in the Apollo configuration. See the
[MongoDB installation instructions](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/)
for details. MongoDB must be configured in a replica set configuration for
Apollo to work properly.

:::

## Set up Apollo Collaboration Server

The first step in setting up the collaboration server is to further configure
the apache2 server we installed when setting up JBrowse. We're going to use
apache2 as a "gateway" (a.k.a. "forward and reverse proxy") server. This is so
that the same server can handle requests for the JBrowse static files and
forward requests for the Apollo Collaboration Server to our running server
process (which we will set up shortly). It does this by inspecting the request
and if the path starts with `apollo/` or is for `config.json`, it forwards the
request to the Apollo Collaboration Server, otherwise it handles the request as
a static file server.

To set this up, we first need to enable some mods on our apache2 server.

```sh
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
```

Now we'll configure the proxy by editing the file
`/etc/apache2/sites-available/000-default.conf`.

```sh
sudo nano /etc/apache2/sites-available/000-default.conf
```

Add these lines near the bottom of the file, above the `</VirtualHost>` line.

```txt
	ProxyPass "/config.json" "http://localhost:3999/jbrowse/config.json"
	ProxyPassReverse "/config.json" "http://localhost:3999/jbrowse/config.json"
	ProxyPassMatch "^/apollo/(.*)$" "http://localhost:3999/$1" upgrade=websocket connectiontimeout=3600 timeout=3600
	ProxyPassReverse "/apollo/" "http://localhost:3999/"
```

Now we need to restart the apache2 server.

```sh
sudo systemctl restart apache2
```

The next thing we need to do is add a file that defines feature types for
Apollo. This is usually the Sequence Ontology.

```sh
cd /var/www/html/
curl -fsSL https://github.com/The-Sequence-Ontology/SO-Ontologies/raw/refs/heads/master/Ontology_Files/so.json > sequence_ontology.json
```

Now we need to install Node.js on the server. The default Node.js available via
`apt` can have some problems, so we'll configure `apt` to install a different
version.

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

Now we'll fetch the Apollo installation files.

```sh
cd ~
curl -fsSL https://api.github.com/repos/GMOD/Apollo3/releases/latest > apollo.json
TARBALL_URL=$(jq -r '.tarball_url' apollo.json)
curl -fsSL ${TARBALL_URL} > apollo.tar.gz
tar xvf apollo.tar.gz
rm apollo.tar.gz apollo.json
mv GMOD-Apollo3-*/ Apollo/
```

Then install and build Apollo by running

```sh
cd Apollo/
pnpm install
cd packages/apollo-collaboration-server/
pnpm build
```

Now that Apollo is installed, we need to configure it before starting it. We can
do that by adding a file called `.env` in the
`packages/apollo-collaboration-server/` directory (e.g. by using `nano`) and
adding these contents to that file. Note that for "URL", you should put the URL
for your server, followed by `/apollo/`.

```env
URL=<forwarded address>/apollo/
NAME=My Apollo Instance
DB_BACKEND=postgresql
DB_CONNECTION_URL=postgresql://apollo:your-secure-password@localhost:5432/apollo
FILE_UPLOAD_FOLDER=/home/ubuntu/data/uploads
JWT_SECRET=some-secret-value
SESSION_SECRET=some-other-secret-value
ALLOW_ROOT_USER=true
ROOT_USER_PASSWORD=some-secret-password
```

You can find more configuration options in the
[Apollo docs](https://apollo.jbrowse.org/docs/getting-started/deployment/configuration-options).

Now we can start Apollo by running

```sh
yarn start:prod
```

Open the URL of your server. Open an "Empty" session, and then choose "Continue
as Guest" in the dialog that appears.

![Login dialog](apollo_login.png)

Congratulations, Apollo is now ready to use!
