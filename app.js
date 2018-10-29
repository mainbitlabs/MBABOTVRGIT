/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var config = require('./config');
var azurest = require('azure-storage');
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
    
    function (session) {
        // Primer diálogo    
        session.send(`**Importante: este Bot tiene un ciclo de vida de 5 minutos**, te recomendamos concluir la actividad antes de este periodo. \n **Sugerencia:** Si por alguna razón necesitas cancelar la solicitud introduce el texto **cancelar.**`);
        time = setTimeout(() => {
            session.endConversation(`**Ha transcurrido el tiempo estimado para completar esta actividad.** \n **Intentalo nuevamente**`);
        }, 300000);
        builder.Prompts.text(session, '¿Cuál es el número de ticket que deseas revisar?');
    },
    function (session, results) {
        // Segundo diálogo
        session.dialogData.ticket = results.response;
        builder.Prompts.text(session, '¿Cuál es el nombre del asociado?')
    },
    function (session, results) {
        session.dialogData.asociado = results.response;
        // Tercer diálogo
        tableService.retrieveEntity(config.table1, session.dialogData.asociado, session.dialogData.ticket, function(error, result, response) {
            // var unlock = result.Status._;
            if(!error ) {
    
                session.send(`Hola ${session.dialogData.asociado}. Esta es la información del Ticket: \n **Número de Ticket: ${session.dialogData.ticket} \n Asociado: ${result.PartitionKey._}  \n Proyecto: ${result.PROYECTO._}  \n Localidad: ${result.ESTADO._} \n Descripción: ${result.DESCRIPCION._}.**`);
                builder.Prompts.choice(session, 'Hola ¿deseas solicitar alguna de las siguientes opciones?', [Choice.Viaticos, Choice.Refacciones, Choice.Ambos], { listStyle: builder.ListStyle.button });
            }
            else{
                session.endDialog("**Error: Los datos son incorrectos, intentalo nuevamente.**");
            }
        });
    },
    function (session, results) {
        var selection = results.response.entity;
        switch (selection) {
            // Viaticos
            case Choice.Viaticos:
            // return session.beginDialog('viaticos');
            tableService.retrieveEntity(config.table1, session.dialogData.asociado, session.dialogData.ticket, function(error, result, response) {
                // var unlock = result.Status._;
                if(!error ) {
                    session.send(`Estos son los viáticos preaprobados para el ticket ${result.RowKey._}: \n **Viáticos: $ ${result.VIATICOS._}**`);
                    builder.Prompts.choice(session, '¿Estás de acuerdo?', [Flujo.Si, Flujo.No], { listStyle: builder.ListStyle.button });
                }
                else{
                    session.endDialog("**Error:**");
                }
            });
                break;
            // Viaticos
            case Choice.Refacciones:
            // return session.beginDialog('viaticos');
            tableService.retrieveEntity(config.table1, session.dialogData.asociado, session.dialogData.ticket, function(error, result, response) {
                // var unlock = result.Status._;
                if(!error ) {
                    session.send(`Estos son los gastos para refacciones preaprobados para el ticket ${result.RowKey._}: \n **Refacciones: $ ${result.REFACCION._}**`);
                    builder.Prompts.choice(session, '¿Estás de acuerdo?', [Flujo.Si, Flujo.No], { listStyle: builder.ListStyle.button });
                }
                else{
                    session.endDialog("**Error:**");
                }
            });
                break;
            // Refacciones
            case Choice.Ambos:
                tableService.retrieveEntity(config.table1, session.dialogData.asociado, session.dialogData.ticket, function(error, result, response) {
                    if(!error ) {
                        var viaticos= result.VIATICOS._;
                        var refacciones= result.REFACCION._;
                        var total = parseInt(viaticos) + parseInt(refacciones);
                        session.send(`Estos son los gastos preaprobados para viáticos y refacciones para el ticket ${result.RowKey._}: \n **Viáticos: $${result.VIATICOS._}** \n **Refacciones: $${result.REFACCION._}** \n **Total $${total}**`);
                        builder.Prompts.choice(session, '¿Estás de acuerdo?', [Flujo.Si, Flujo.No], { listStyle: builder.ListStyle.button });

                    }
                    else{
                        session.endDialog("**Error:**");
                    }
                });            break;
            }
        
    },
    function (session, results) {
        var choice2 = results.response.entity;
    switch (choice2) {
        case Flujo.No:
            builder.Prompts.text(session, '¿Cuál es la cantidad que deseas solicitar?')
            break;
        case Flujo.Si:
        session.endDialog('**Se te notificará por correo la aprobación de está solicitud. \n Saludos.**');
            break;
}
       
    },
    function (session, results) {
        session.dialogData.cantidad = results.response; 
        var myrequest = {
            PartitionKey : {'_': session.dialogData.asociado, '$':'Edm.String'},
            RowKey: {'_': session.dialogData.ticket, '$':'Edm.String'},
            CantidadSolicitada: {'_': session.dialogData.cantidad, '$':'Edm.String'}
        };
        // Función de guardar solicitud de cantidad en tabla 2
        tableService.insertOrReplaceEntity (config.table2, myrequest, function(error) {
        if(!error) {
            console.log('Entity tabla2 inserted');   // Entity inserted
        }
        }); 
        session.endDialog(`**En este momento se iniciará un flujo de aprobación por la cantidad de ${session.dialogData.cantidad}, se notificará por correo la respuesta de está solicitud. \n Saludos.**`);

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