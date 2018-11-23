/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var config = require('./config');
var azurest = require('azure-storage');
var axios = require('axios');
var request = require('request');
var tableService = azurest.createTableService( config.storageA, config.accessK );

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);


var Choice = {
    Viaticos: 'Viáticos',
    Refacciones: 'Refacciones',
    Ambos: 'Ambos'
};
var Flujo = {
    Si: 'Si',
    No: 'No'
};

// El díalogo principal inicia aquí
bot.dialog('/', [
    function (session, next) {
        // Primer diálogo    
        session.send(`**Importante: este Bot tiene un ciclo de vida de 5 minutos**, te recomendamos concluir la actividad antes de este periodo. \n **Sugerencia:** Si por alguna razón necesitas cancelar la solicitud introduce el texto **cancelar.**`);
        time = setTimeout(() => {
        session.endConversation(`**Ha transcurrido el tiempo estimado para completar esta actividad.** \n **Intentalo nuevamente**`);
        }, 300000);
        builder.Prompts.text(session, '¿Cuál es el número de ticket de **ServiceNow** que deseas revisar?');    },
    function (session, results) {
        session.dialogData.ticket = results.response;
        session.dialogData.sysID = '';
        axios.get(

            'https://mainbitdev1.service-now.com/api/now/v2/table/incident?number='+session.dialogData.ticket,
            {headers:{"Accept":"application/json","Content-Type":"application/json","Authorization": ("Basic " + new Buffer("mjimenez@mainbit.com.mx:Mainbit.1").toString('base64'))}}
        
        ).then((data)=>{
        
            var result = data.data.result[0];
            session.dialogData.sysID = data.data.result[0].sys_id;
            //console.log(" Título:", data.data.result );
            session.send(session.dialogData.sysID);
            session.send(` Título: **${result.subcategory}** \n Descripción: **${result.short_description}** \n Creado por: **${result.sys_created_by}** \n Creado el: **${result.sys_created_on}** \n Última actualización: **${result.sys_updated_on}** \n Resuelto el: **${result.resolved_at}**`)
            builder.Prompts.attachment(session, 'Adjunta una foto aquí')
        
        }).catch((e)=>{
        
            console.log("error",e.toString());
        
        });
       
    },
    function (session, results) {
        var msg = session.message;
        if (msg.attachments && msg.attachments.length > 0) {
         // Echo back attachment
         var attachment = msg.attachments[0];
            session.send({
                "attachments": [
                  {
                    "contentType": attachment.contentType,
                    "contentUrl": attachment.contentUrl,
                    "name": attachment.name
                  }
                ],});
                var file = attachment.contentUrl;
console.log(attachment.contentUrl);

                var data = request(file);
        axios.post(
            'https://mainbitdev1.service-now.com/api/now/attachment/file?table_name=incident&table_sys_id='+session.dialogData.sysID+'&file_name='+attachment.name,
            data,
            {headers:{"Accept":"application/json","Content-Type":"image/png","Authorization": ("Basic " + new Buffer("mjimenez@mainbit.com.mx:Mainbit.1").toString('base64'))}},
        ).then((data)=>{
        console.log('done'+ data.data.result);
        }).catch((error)=>{
            console.log("error",error.toString());
        });
         } else {
            // Echo back users text
            session.send("You said: %s", session.message.text);
        }

    }
]);

// Diálogo de cancelación
bot.dialog('cancel',
    function (session) {
        clearTimeout(time);
        session.endDialog('**Has cancelado manualmente este proceso, puedes volver a iniciar desde el principio.**');
        // session.beginDialog('/');
    }
).triggerAction(
    {matches: /^cancelar/gi}
);