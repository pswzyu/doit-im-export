// Please change this variable. This should be the earlist task you have in your
//    doit.im account. The script will start from the current month and go back month
//    by month and stops after having exported stop_ym.
var stop_ym = new Date("2014", "2");

// Please change this variable
var username = "";

// Please change this variable
var password = "";


//-------------------------


var fs = require('fs');

var page = require('webpage').create();

// make sure the folders are created
if (!fs.exists("archived")) {
  fs.makeDirectory("archived");
}
if (!fs.exists("tasks")) {
  fs.makeDirectory("tasks");
}

var all_tasks = [];

function waitFor(testFx, onReady, timeOutMillis) {
    var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 20000, //< Default Max Timout is 3s
        start = new Date().getTime(),
        condition = false,
        interval = setInterval(function() {
            if ( (new Date().getTime() - start < maxtimeOutMillis) && !condition ) {
                // If not time-out yet and condition not yet fulfilled
                condition = (typeof(testFx) === "string" ? eval(testFx) : testFx()); //< defensive code
            } else {
                if(!condition) {
                    // If condition still not fulfilled (timeout but condition is 'false')
                    console.log("'waitFor()' timeout");
                    phantom.exit(1);
                } else {
                    // Condition fulfilled (timeout and/or condition is 'true')
                    console.log("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
                    typeof(onReady) === "string" ? eval(onReady) : onReady(); //< Do what it's supposed to do once the condition is fulfilled
                    clearInterval(interval); //< Stop this interval
                }
            }
        }, 250); //< repeat check every 250ms
};


function saveTasks() {

  var intid;
  var step = 0;
  var task_uri;
  function run(){

    if (! page.evaluate(function(){
      return document.querySelector("#data_loading").style.display == "none";
    }) ) {
      return;
    }

    if (step == 0) {
      // get one task_uri
      task_uri = all_tasks.pop();
      if (!task_uri) {
        clearInterval(intid);
        page.close();
        phantom.exit();
      }
      var url = "https://i.doit.im/home/"+task_uri;
      page.evaluate("function(){window.location.replace(\""+url+"\");}");
      step = 1;
    } else if (step == 1) {
      // make sure all details are loaded
      var details = page.evaluate(function(){

        var task_paper = document.querySelector("#task_paper");
        var note = document.querySelector("ul.detail li.note");
        var subtasks = document.querySelector("ul.detail li.subtasks");
        var comments = document.querySelector("ul.detail li.comments");
        return { "task":     task_paper?task_paper.innerHTML:null,
                 "note":     note?note.innerHTML:null,
                 "subtasks": subtasks?subtasks.innerHTML:null,
                 "comments": comments?comments.innerHTML:null
        };
      });
      console.log("CL: saving task: " + task_uri);

      if (!details || !details.note || !details.subtasks || !details.comments) {
        return;
      }

      fs.write("tasks/"+task_uri+".html", details.task, "w");
      step = 0;
    }
  }

  // first switch to a start page
  page.evaluate(function(){
    window.location.replace("https://i.doit.im/home/#/completed/")
  });

  intid = setInterval(run, 500);
}

function saveArchived() {

  console.log("CL:Saving completed.");
  var shared;
  var intid;
  var step = 0;
  function run(){
    if (! page.evaluate(function(){
      return document.querySelector("#data_loading").style.display == "none";
    }) ) return;

    if (step == 0) {
      page.evaluate(function(){
        document.querySelector("#switchbar div.completed").click();
      });
      step=1;
    } else if (step == 1) {
      page.evaluate(function(){
        document.querySelector("#monthly").click();
      });
      step=2;
    } else if (step == 2) {
      var retData = page.evaluate(function(){
        // get which month it is, in YYYY.MM format
        var ret;
        var retArray = [];
        var y_and_m = document.querySelector("#group_monthly input").value.split(".");
        y_and_m = new Date(y_and_m[0], y_and_m[1]-1);
        console.log("CL: working on "+y_and_m.toString());
        // get the whole div of all the completion dates
        var divs = document.querySelectorAll("#task_group div[ng-show=showGroup\\(group\\)]");
        // for each date
        for (var i = 0; i < divs.length; i++) {
          // get the div of the date.
          var wrapper = document.createElement("div");
          wrapper.appendChild(divs[i].cloneNode(true));
          var link_eles = divs[i].querySelectorAll("li .link-title");
          var links = [];
          // get the links to each task
          for (var j = 0; j < link_eles.length; j++) {
            // ignore the results starting with #/project/...
            if (link_eles[j].getAttribute("href").indexOf("task")>0) {
              links.push(link_eles[j].getAttribute("href"));
            }
          }
          retArray.push({"html": wrapper.innerHTML, "hrefs":links});
        }
        return {"month": y_and_m, "ym": y_and_m.format("yyyy_mm"), "dates": retArray};
      });
      var groups = retData.dates;
      console.log("CL:Saving completed to file.");
      for (var i = 0; i < groups.length; i++) {
        fs.write("archived/"+retData.ym+"-"+i+".html", groups[i].html, "w");
        for (var j = 0; j < groups[i].hrefs.length; j++) {
          all_tasks.push(groups[i].hrefs[j]);
          console.log(groups[i].hrefs[j]);
        }
      }

      if (retData.month < stop_ym) {
        clearInterval(intid);
        saveTasks();
      } else {
        step = 3;
      }
    } else if (step == 3) {
      // go to prev page
      page.evaluate(function(){
        document.querySelector("#group_monthly li.prev").click();
      });
      step=2;
    }
  }
  intid = setInterval(run, 500);

}

page.viewportSize = {
  width: 1920,
  height: 1920
};

page.open('https://i.doit.im/signin', function(status) {
  console.log("Status: " + status);
  if(status === "success") {
    waitFor(function() {
            // Check in the page if a specific element is now visible
            return page.evaluate(function() {
                return document.querySelector("input#username");
            });
        }, function() {
          console.log("CL:Typing in login info.");

          page.evaluate(function(){
            document.querySelector("input#username").value = username;
            document.querySelector("input#login_password").value = password;
            document.querySelector(".submit_btn_box input").click();
          });
          // and then wait for "completed" tab on the left
          waitFor(function(){
            return page.evaluate(function(){
              return document.querySelector("#completed");
            });
          }, function(){
            // click on the tab
            console.log("CL:Switching to completed tab.");
            page.evaluate(function(){
              document.querySelector("#completed a").click();
            });

            saveArchived();

          });

        });
  }

});
