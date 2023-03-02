
    # pull official base image 
    FROM node:16-alpine 

    RUN apt-get update
    RUN apt-get install -y git
    RUN mkdir -p ./my-app && cd ./my-app
    RUN git clone -n https://athessi10@gmail.com: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@github.com/atharva-borekar/react-deploy
  
    # set working directory 
    WORKDIR /app 
  
    # add "/app/node_modules/.bin" to $PATH 
    ENV PATH /app/node_modules/.bin:$PATH 
  
    # add app 
    COPY . /app 
  
    # install app dependencies 
    COPY package.json /app 
  
    #COPY package-lock.lock /app 
    RUN npm i react-scripts@3.4.1 
    RUN npm install 
    RUN npm build 
  
    # start app 
    CMD ["npm", "start"]