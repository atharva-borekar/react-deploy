# pull official base image 
FROM node:16-alpine 

# set working directory 


RUN apk update
RUN apk add git
RUN git clone https://atharva-borekar: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@github.com/atharva-borekar/react-deploy.git

WORKDIR react-deploy 
# add "/app/node_modules/.bin" to $PATH 
# ENV PATH /app/node_modules/.bin:$PATH 
  
# add app 
# COPY . /app 

RUN npm i react-scripts@3.4.1 
RUN npm install 
  
# start app 
CMD ["npm", "start"]