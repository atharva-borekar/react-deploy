const { exec } = require('child_process');
const { resolve } = require('path');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const configConstants = {
  NODE_VERSION: 'nodeVersion',
  WORK_DIRECTORY: 'workDirectory',
  DOCKER_COMPOSE_FILE_NAME: 'dockerComposeFilename',
  DOCKERFILE_NAME: 'dockerfileName',
  DOCKER_VERSION: 'dockerVersion',
  CONTAINER_NAME: 'containerName',
  CONTAINER_PORT: 'containerPort',
  HOST_PORT: 'hostPort',
  NGINX_CONFIG_FILE_NAME: 'nginxConfigFileName'
};

const defaultConfig = {
  [configConstants.NODE_VERSION]: 'node:16-alpine',
  [configConstants.WORK_DIRECTORY]: '/app',
  [configConstants.DOCKER_COMPOSE_FILE_NAME]: 'docker-compose.yml',
  [configConstants.DOCKERFILE_NAME]: 'Dockerfile',
  [configConstants.DOCKER_VERSION]: '3.3',
  [configConstants.CONTAINER_NAME]: 'my-app',
  [configConstants.CONTAINER_PORT]: '80',
  [configConstants.HOST_PORT]: '80',
  [configConstants.NGINX_CONFIG_FILE_NAME]: 'default.conf'
};

const Reset = '\x1b[0m';
const Bright = '\x1b[1m';
const Dim = '\x1b[2m';
const Underscore = '\x1b[4m';
const Blink = '\x1b[5m';
const Reverse = '\x1b[7m';
const Hidden = '\x1b[8m';

const FgBlack = '\x1b[30m';
const FgRed = '\x1b[31m';
const FgGreen = '\x1b[32m';
const FgYellow = '\x1b[33m';
const FgBlue = '\x1b[34m';
const FgMagenta = '\x1b[35m';
const FgCyan = '\x1b[36m';
const FgWhite = '\x1b[37m';
const FgGray = '\x1b[90m';

const printSuccess = msg => console.log(FgGreen, msg);
const printError = msg => console.log(FgRed, msg);
const printWarning = msg => console.log(FgYellow, msg);
const printProgress = msg => console.log(Blink, msg);
const print = msg => console.log(FgWhite, msg);

const parseArguments = () => {
  const args = process.argv;
  args.splice(0, 2);

  let deploymentConfig = {};
  args?.map(argument => {
    let [key, value] = argument.split('=');
    key = key.slice(2);
    if (key && value) {
      deploymentConfig[key] = value;
    }
  });
  return deploymentConfig;
};

const getNginxConfigFile = args => {
  return `server {
    listen 80 default_server;
    root /var/www/html;

    index index.html index.htm;

    server_name ${args.publicIp};

    location / {
            # First attempt to serve request as file, then
            # as directory, then fall back to displaying a 404.
            try_files $uri $uri/ =404;
    }
}
`;
};

const createNginxConfigFile = args => {
  const { nginxConfigFileName } = args;
  return new Promise((resolve, reject) => {
    resolve(
      import('fs').then(fs => {
        fs.writeFile(
          nginxConfigFileName ??
            defaultConfig[configConstants.NGINX_CONFIG_FILE_NAME],
          getNginxConfigFile(args),
          err => {
            if (err) throw err;
          }
        );
      })
    );
  });
};

const installPackages = () =>
  new Promise((resolve, reject) => {
    exec(
      'npm install react-scripts && npm install ssh2 && npm i',
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Error encountered while installing NPM packages: ${error.message}`
            )
          );
        }
        if (stderr) {
          printWarning(`stderr: ${stderr}`);
          return;
        }
        print(stdout);
        resolve('Packages installed successfully!');
      }
    );
  });

const createBuild = () =>
  new Promise((resolve, reject) => {
    exec('npm run build', (error, stdout, stderr) => {
      if (error) {
        reject(`Error encountered when creating build: ${error.message}`);
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
      }
      print(stdout);
      resolve(
        `
          +==========================+
          |  Build has been created  |
          |      Successfully!       |
          +==========================+`
      );
    });
  });

const userConfig = () =>
  new Promise((resolve, reject) => {
    const configObj = {};
    readline.question('Enter deployment server public ip: ', publicIp => {
      configObj['publicIp'] = publicIp;
      readline.question('Enter instance public dns: ', publicDns => {
        configObj['publicDns'] = publicDns;
        resolve(configObj);
        readline.close();
      });
    });
  });

const addSshKeyToHost = ({ keyName, publicDns }) =>
  new Promise((resolve, reject) => {
    console.log(`ssh -i "${keyName}" ${publicDns}`);
    exec(`ssh -i "${keyName}" ${publicDns}`, (error, stdout, stderr) => {
      if (error) {
        reject(`Error encountered when adding ssh key: ${error.message}`);
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
      }

      print(stdout);
    }).stdin.write('yes');
  });

const main = async () => {
  const args = parseArguments();
  const {
    nodeVersion,
    workingDirectory,
    gitUser,
    gitToken,
    gitUsername,
    repoName,
    folderPath
  } = args;
  if (args['help'])
    console.log(
      `
    Flags for deployment config:
    --nodeVersion=<NODE VERSION HERE> //specify node version for application (default: node:16-alpine)
    --workDirectory=<WORK DIRECTORY PATH>  //specify work direcory path inside container where application will be present
    --dockerComposeFilename=<>
    --dockerfileName=<>
    --dockerVersion=<>
    --containerName=<>
    --containerPort=<>
    --hostPort=<>
    `
    );

  userConfig()
    .then(configObj => {
      console.log('Installing dependencies --->');
      installPackages()
        .then(res => {
          console.log(res);
          console.log('Creating static build --->');
          createBuild()
            .then(res => {
              console.log('Completed build');
              console.log(res);
              console.log('Creating Nginx config file --->');
              createNginxConfigFile({
                publicIp: configObj['publicIp']
              })
                .then(() => {
                  console.log('Nginx config file created successfully!');

                  const Client = require('ssh2').Client;

                  const conn = new Client();

                  conn.on('ready', () => {
                    console.log('Client :: ready');
                    exec(
                      `scp -i deploy-react.pem -y -a build {${configObj['publicDns']}}:~/build`
                    );
                    conn.exec(
                      `sudo apt-get update && sudo apt-get install nginx-core -y`,
                      (err, stream) => {
                        if (err) throw err;
                        stream
                          .on('close', (code, signal) => {
                            console.log('Copying nginx config');

                            exec(
                              `scp -i deploy-react.pem default.conf ${configObj['publicDns']}:~/etc/nginx/sites-available/
                       scp -i deploy-react.pem default.conf ${configObj['publicDns']}:~/etc/nginx/conf.d/
                      `
                            );
                            console.log('Copying nginx config successful!');

                            conn.exec(
                              'cd && sudo cp -r build/. /var/www/html/',
                              (err, stream) => {
                                if (err) throw err;
                                stream
                                  .on('close', (code, signal) => {
                                    conn.exec(
                                      'sudo systemctl restart nginx',
                                      (err, stream) => {
                                        if (err) throw err;
                                        stream
                                          .on('close', (code, signal) => {
                                            conn.end();
                                          })
                                          .on('data', data => {
                                            console.log('STDOUT: ' + data);
                                          })
                                          .stderr.on('data', data => {
                                            console.log('STDERR: ' + data);
                                          });
                                      }
                                    );
                                  })
                                  .on('data', data => {
                                    console.log('STDOUT: ' + data);
                                  })
                                  .stderr.on('data', data => {
                                    console.log('STDERR: ' + data);
                                  });
                              }
                            );
                          })
                          .on('data', data => {
                            console.log('STDOUT: ' + data);
                          })
                          .stderr.on('data', data => {
                            console.log('STDERR: ' + data);
                          });
                      }
                    );
                  });

                  conn.on('error', err => {
                    console.log('Error :: ' + err);
                  });

                  conn.on('end', () => {
                    console.log('Client :: end');
                    conn.end();
                  });

                  conn.connect({
                    host: configObj['publicIp'],
                    port: 22,
                    username: 'ubuntu',
                    privateKey: require('fs').readFileSync('deploy-react.pem')
                  });
                })
                .catch(err => {
                  console.log(err);
                });
            })
            .catch(err => {
              console.log(err);
            });
        })
        .catch(err => {
          console.log(err);
        });
    })
    .catch(err => {});

  return;
};

main();

//copy build from client to server
//scp -i deploy-react.pem -r build ubuntu@ec2-15-207-254-16.ap-south-1.compute.amazonaws.com:~/

//copy build from root to /var/www/html
//cd && sudo cp -r build/. /var/www/html/
