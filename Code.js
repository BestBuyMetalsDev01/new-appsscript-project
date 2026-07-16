// ==========================================
// GLOBAL CONFIGURATION & WEB APP SERVING
// ==========================================

/**
 * Serves the HTML frontend when the Web App URL is visited.
 */
function doGet(e) {
  // Support API requests locally/externally using query parameters
  if (e && e.parameter && e.parameter.action === 'getOrderDetails') {
    var orderNumber = e.parameter.orderNumber;
    var data = getOrderDetailsBySql(orderNumber);
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var output = HtmlService.createHtmlOutputFromFile('index');
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  output.setTitle('Order Barcode Scanner & Dispatch');
  return output;
}

/**
 * API Configuration using Script Properties.
 * Make sure to define 'Live_Link', 'Live_Key', 'Sandbox_Link', and 'Sandbox_Key' in Project Settings!
 */
function getApiConfig(isLive) {
  var scriptProperties = PropertiesService.getScriptProperties();
  if (isLive) {
    return {
      baseUrl: scriptProperties.getProperty('Live_Link'), 
      apiKey: scriptProperties.getProperty('Live_Key') 
    };
  } else {
    return {
      baseUrl: scriptProperties.getProperty('Sandbox_Link'), 
      apiKey: scriptProperties.getProperty('Sandbox_Key') 
    };
  }
}

/**
 * Executes the SQL query for a dynamically provided order number.
 * Callable from client-side JavaScript via google.script.run.
 * 
 * @param {string} orderNumber Scanned barcode or manual input.
 * @return {Array<Object>} The raw row results from the database query.
 */
function getOrderDetailsBySql(orderNumber) {
  const isLive = true; // Set to false to test with sandbox credentials
  const config = getApiConfig(isLive);
  
  if (!orderNumber) {
    Logger.log("Error: No order number provided.");
    return [];
  }

  // Sanitize input to prevent basic SQL injection issues
  const sanitizedOrder = orderNumber.replace(/['";]/g, "").trim();

  // Explicit columns selected to avoid duplicate JSON keys collision
  var sqlQuery = [
    "select",
    "  ISNULL(pl.strStagingArea, '') as strStagingArea,",
    "  od.strProductID,",
    "  o.strOrderNumber,",
    "  o.cntID as orderHeaderID,",       
    "  od.cntID as orderDetailID,",     
    "  pl.cntID as pullLabelID",        
    "from tblOEOrder o",
    "inner join tblOEOrderDetail od on od.strOrderNumber = o.strOrderNumber",
    "left join DelMe.tblDMPullLabel pl on pl.strOrderNumber = o.strOrderNumber and pl.intTransDetCntID = od.cntID",
    "where o.strOrderNumber = 'ORDERNUMBER'"
  ].join("\n").replace('ORDERNUMBER', sanitizedOrder);

  // Setup the endpoint configuration
  var requestUrl = config.baseUrl + "/api/Report?query=" + encodeURIComponent(sqlQuery);
  var headers = {
    "Accept": "application/json", 
    "x-api-key": config.apiKey
  };
  
  var options = {
    'method': 'GET',
    'headers': headers,
    'muteHttpExceptions': true
  };

  try {
    var response = UrlFetchApp.fetch(requestUrl, options);
    var responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error("API Response Code: " + responseCode + " - " + response.getContentText().substring(0, 150));
    }

    var responseText = response.getContentText().trim();
    if (!responseText || responseText === '""' || responseText === "[]") {
      return []; // Return empty array to indicate order not found cleanly
    }
    
    var rows = JSON.parse(responseText);
    if (typeof rows === 'string') { 
      rows = JSON.parse(rows); 
    }
    
    // Normalize return formats (ensures it is an array of rows)
    if (!Array.isArray(rows)) {
      rows = rows.data || rows.results || [];
    }
    
    return rows;

  } catch (e) {
    Logger.log("Error fetching data: " + e.message);
    throw new Error(e.message); // Bubble error up to show visually in the Web App interface
  }
}