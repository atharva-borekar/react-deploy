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

const getDockerfileContent = args => {
  const {
    nodeVersion,
    workingDirectory,
    gitUser,
    gitToken,
    gitUsername,
    repoName,
    folderPath
  } = args;
  const { NODE_VERSION, WORK_DIRECTORY } = configConstants;

  return `# pull official base image 
FROM ${nodeVersion ?? defaultConfig[NODE_VERSION]} as build

# set working directory 
WORKDIR /app

RUN apk update
RUN apk add git
RUN git clone https://${gitUsername}:${gitToken}@github.com/${gitUsername}/${repoName}.git

WORKDIR /app/${repoName}
RUN npm install --production
RUN npm run build

CMD ["npm", "run", "start"]
`;
};

const getDockerComposeContent = args => {
  const { dockerVersion, containerName, dockerfileName, hostPort, containerPort } =
    args;
  const {
    DOCKER_VERSION,
    CONTAINER_NAME,
    DOCKERFILE_NAME,
    HOST_PORT,
    CONTAINER_PORT
  } = configConstants;

  return `version: '${dockerVersion ?? defaultConfig[DOCKER_VERSION]}'
services:
  web:
    container_name: ${containerName ?? defaultConfig[CONTAINER_NAME]}
    build:
      context: .
      dockerfile: ${dockerfileName ?? defaultConfig[DOCKERFILE_NAME]}
    ports:
      - ${hostPort ?? defaultConfig[HOST_PORT]}:${
    containerPort ?? defaultConfig[CONTAINER_PORT]
  }
    environment:
      - CHOKIDAR_USEPOLLING=true
    restart: always`;
};

const getNginxConfigFile = args => {
  return `server {
    listen 80 default_server;
    root /var/www/html;

    index index.html index.htm;

    server_name 3.109.154.134;

    location / {
            # First attempt to serve request as file, then
            # as directory, then fall back to displaying a 404.
            try_files $uri $uri/ =404;
    }
}
`;
};

const createDockerComposeFile = args => {
  const { dockerComposeFilename } = args;

  return new Promise((resolve, reject) => {
    resolve(
      import('fs').then(fs => {
        fs.writeFile(
          dockerComposeFilename ??
            defaultConfig[configConstants.DOCKER_COMPOSE_FILE_NAME],
          getDockerComposeContent(args),
          err => {
            if (err) throw err;
          }
        );
      })
    );
  });
};

const createDockerfile = args => {
  const { dockerfileName } = args;

  return new Promise((resolve, reject) => {
    resolve(
      import('fs').then(fs => {
        fs.writeFile(
          dockerfileName ?? defaultConfig[configConstants.DOCKERFILE_NAME],
          getDockerfileContent(args),
          err => {
            if (err) throw err;
          }
        );
      })
    );
  });
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
  let filesCreated = {
    dockerFile: false,
    dockerComposeFile: false,
    nginxFile: false
  };

  await createDockerfile(args).then(() => {
    filesCreated['dockerFile'] = true;
  });

  await createDockerComposeFile(args).then(() => {
    filesCreated['dockerComposeFile'] = true;
  });

  await createNginxConfigFile(args).then(() => {
    filesCreated['nginxFile'] = true;
  });

  if (
    filesCreated['dockerFile'] &&
    filesCreated['dockerComposeFile'] &&
    filesCreated['nginxFile']
  ) {
    console.log('after all files created');
    const Client = require('ssh2').Client;

    const conn = new Client();
    conn.on('ready', () => {
      console.log('Client :: ready');
      conn.exec(
        `sudo apt-get update\n
        sudo apt-get install nodejs -y\n
        sudo apt-get install npm -y\n
        sudo rm -R ${repoName}\n
        sudo git clone https://${gitUsername}:${gitToken}@github.com/${gitUsername}/${repoName}.git
        cd ${repoName}
        sudo npm i --force
        sudo npm run build
        sudo cp -r build/. /var/www/html/
        `,
        (err, stream) => {
          if (err) throw err;
          stream
            .on('close', (code, signal) => {
              conn.exec(
                `sudo apt-get update\n
              curl -fsSL https://get.docker.com -o get-docker.sh\n
              sh get-docker.sh\n
              sudo apt-get install nginx -y\n
              sudo apt-get install docker-compose-plugin\n
              sudo docker run hello-world`,
                (err, stream) => {
                  if (err) throw err;
                  stream
                    .on('close', (code, signal) => {
                      console.log('in transfer');
                      require('child_process').exec(
                        'scp -i react-deploy-2.pem Dockerfile docker-compose.yml default.conf ubuntu@ec2-3-109-154-134.ap-south-1.compute.amazonaws.com:~/react-deploy'
                      );
                      console.log('after transfer');

                      conn.exec(
                        `
                        ls
                        sudo docker stop $(sudo docker ps -a -q)
                        sudo docker rm $(sudo docker ps -a -q)
                        cd react-deploy
                        ls -a
                        sudo docker compose build
                        sudo docker compose up -d
                        sudo systemctl status nginx
                        sudo systemctl start nginx
                        `,
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
                      if (data === '[Y/n]') stream.write('Y');
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
      host: '3.109.154.134',
      port: 22,
      username: 'ubuntu',
      privateKey: require('fs').readFileSync('react-deploy-2.pem')
    });
  }
};

main();
