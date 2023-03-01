const configConstants = {
  NODE_VERSION: 'nodeVersion',
  WORK_DIRECTORY: 'workDirectory',
  DOCKER_COMPOSE_FILE_NAME: 'dockerComposeFilename',
  DOCKERFILE_NAME: 'dockerfileName',
  DOCKER_VERSION: 'dockerVersion',
  CONTAINER_NAME: 'containerName',
  CONTAINER_PORT: 'containerPort',
  HOST_PORT: 'hostPort'
};

const defaultConfig = {
  [configConstants.NODE_VERSION]: 'node:16-alpine',
  [configConstants.WORK_DIRECTORY]: '/app',
  [configConstants.DOCKER_COMPOSE_FILE_NAME]: 'docker.compose.yml',
  [configConstants.DOCKERFILE_NAME]: 'Dockerfile',
  [configConstants.DOCKER_VERSION]: '3.3',
  [configConstants.CONTAINER_NAME]: 'my-app',
  [configConstants.CONTAINER_PORT]: '3000',
  [configConstants.HOST_PORT]: '3000'
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
    gitUserName,
    repoName,
    folderPath
  } = args;
  const { NODE_VERSION, WORK_DIRECTORY } = configConstants;

  return `
    # pull official base image 
    FROM ${nodeVersion ?? defaultConfig[NODE_VERSION]} 

    RUN apt-get update
    RUN apt-get install -y git
    RUN mkdir -p ${folderPath} && cd ${folderPath}
    RUN git clone -n https://${gitUser}:${gitToken}@github.com/${gitUserName}/${repoName}
  
    # set working directory 
    WORKDIR ${workingDirectory ?? defaultConfig[WORK_DIRECTORY]} 
  
    # add "/app/node_modules/.bin" to $PATH 
    ENV PATH ${
      workingDirectory ?? defaultConfig[WORK_DIRECTORY]
    }/node_modules/.bin:$PATH 
  
    # add app 
    COPY . ${workingDirectory ?? defaultConfig[WORK_DIRECTORY]} 
  
    # install app dependencies 
    COPY package.json ${workingDirectory ?? defaultConfig[WORK_DIRECTORY]} 
  
    #COPY package-lock.lock /app 
    RUN npm i react-scripts@3.4.1 
    RUN npm install 
    RUN npm build 
  
    # start app 
    CMD ["npm", "start"]`;
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

  return `
  version: '${dockerVersion ?? defaultConfig[DOCKER_VERSION]}'
  services:
    sample:
      container_name: ${containerName ?? defaultConfig[CONTAINER_NAME]}
      build:
        context: .
        dockerfile: ${dockerfileName ?? defaultConfig[DOCKERFILE_NAME]}
      ports:
        - ${hostPort ?? defaultConfig[HOST_PORT]}:${
    containerPort ?? defaultConfig[CONTAINER_PORT]
  }
      environment:
        - CHOKIDAR_USEPOLLING=true`;
};

const createDockerComposeFile = args => {
  const { dockerComposeFilename } = args;
  import('fs').then(fs => {
    fs.writeFile(
      dockerComposeFilename ??
        defaultConfig[configConstants.DOCKER_COMPOSE_FILE_NAME],
      getDockerComposeContent(args),
      err => {
        if (err) throw err;
      }
    );
  });
};

const createDockerfile = args => {
  const { dockerfileName } = args;
  import('fs').then(fs => {
    fs.writeFile(
      dockerfileName ?? defaultConfig[configConstants.DOCKERFILE_NAME],
      getDockerfileContent(args),
      err => {
        if (err) throw err;
      }
    );
  });
};

const main = () => {
  const args = parseArguments();
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

  createDockerfile(args);
  createDockerComposeFile(args);
};

main();
