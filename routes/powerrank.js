var express = require("express");
const superagent = require("superagent");
var jsonQuery = require("json-query");
const asyncHandler = require("express-async-handler");

var router = express.Router();

router.post('/', function (req, res, next) {
  res.redirect('/powerrank/' + req.body.leagueId + '/2018/1');
});

/* GET users listing. */
router.get("/:leagueId/:seasonId/:matchupPeriodId?", function (req, res, next) {
  var teams = {};
  var url = generateUrl(
    req.params.leagueId,
    req.params.seasonId,
    req.params.matchupPeriodId
  );
  superagent
    .get(url)
    .end((err, response) => {
      if (err) {
        console.log("Error getting " + url, err);
        res.send( err);
        return;
      }
      matchupPeriod = jsonQuery("scoreboard.matchupPeriodId", {
        data: response.body
      }).value;

      if(!req.params.matchupPeriodId) matchupPeriod--;

      teams = jsonQuery("scoreboard.matchups.teams", { data: response.body })
        .value;

      points = new Array();
      records = new Array();
      breakdowns = new Array();
      teamList = new Array();

      //Grab the current name as of the period
      teams.forEach(team => {
        teamList.push({teamId: team.teamId, name: team.team.teamLocation + " " + team.team.teamNickname});
      });

      getData(req.params.leagueId, req.params.seasonId, matchupPeriod)
        .then(data => {
          points = squashPoints(data);
          records = squashRecords(data);
          breakdowns = squashBreakdowns(data);

          rank(points);
          rank(records);
          rank(breakdowns);

          ranks = new Array();
          teamList.forEach(team => {
            pointElement = jsonQuery("[teamId=" + team.teamId + "]", {
              data: points
            }).value;
            recordElement = jsonQuery("[teamId=" + team.teamId + "]", {
              data: records
            }).value;
            breakdownElement =
              jsonQuery("[teamId=" + team.teamId + "]", {
                data: breakdowns
              }).value || {};
            ranks.push({
              name: team.name,
              points: pointElement.display(),
              pointsRank: points.length + 1 - pointElement.rank,
              breakdown: breakdownElement.display(),
              breakdownRank: points.length + 1 - breakdownElement.rank,
              record: recordElement.display(),
              recordRank: points.length + 1 - recordElement.rank,
              powerPoints:
                points.length +
                1 -
                pointElement.rank +
                points.length +
                1 -
                breakdownElement.rank +
                points.length +
                1 -
                recordElement.rank,
              compare: function () {
                //PowerPoints first with breakdown/points/record as tiebreaker
                return this.powerPoints + ( this.breakdownRank / 10 ) + (this.pointsRank / 100 ) + (this.recordRank / 1000);
              }
            });
          });

          rank(ranks, false);
          res.render("powerrank", { ranks: ranks });
        });
    })
});

function rank(data = {}, average=true) {
  allVals = new Array();
  data.forEach(element => {
    allVals.push(element.compare());
  });
  allVals.sort(function (a, b) {
    return a - b;
  });
  aCount = new Map(
    [...new Set(allVals)].map(x => [x, allVals.filter(y => y === x).length])
  );
  data.forEach(element => {
    element.rank =
      data.length - ( average ? averageRank(
      allVals.indexOf(element.compare()),
        aCount.get(element.compare()))
        : (allVals.indexOf(element.compare()) +
        (aCount.get(element.compare()) - 1)) )
  });
  data.sort(function (a, b) {
    return a.rank - b.rank;
  });
};

function averageRank(starting, num) {
  sum = 0;
  for (let i = 0; i < num; i++) {
    sum += (starting + i)
  }
  return sum / num;
}

function generateUrl(leagueId, seasonId, matchupPeriodId) {
  return (
    "http://games.espn.com/ffl/api/v2/scoreboard?leagueId=" +
    leagueId +
    "&seasonId=" +
    seasonId + (matchupPeriodId ? 
    "&matchupPeriodId=" +
    matchupPeriodId :"")
  );
};

async function getData(leagueId, seasonId, matchupPeriod) {
  const periods = [];
  for (let index = matchupPeriod; index > 0; index--) {
    periods.push(index);
  }


  const promises = periods.map(period =>
    superagent.get(generateUrl(leagueId, seasonId, period))
      .then(response => {
        // if (err) {
        //   console.log(err);
        //   return;
        // }

        periodTeams = flattenMatchups( jsonQuery("scoreboard.matchups", {
          data: response.body
        }).value);

        return { points: calculatePoints(periodTeams), records: calculateRecord(periodTeams), breakdowns: calculateBreakdown(periodTeams) };
      }));

  return await Promise.all(promises);
}

function flattenMatchups(matchups) {
  const teams = new Array();
  matchups.forEach(matchup => {
    matchup.teams.forEach(team => {
      team.win = 0;
      team.loss = 0;
      team.tie = 0;

      if (matchup.winner === "home")
        if (team.home)
          team.win++;
        else
          team.loss++;
      else if (matchup.winner === "away")
        if (team.home)
          team.loss++;
        else
          team.win++;
      else
        team.tie++;
      teams.push(team);
    });
  });
  return teams;
}

function calculatePoints(teams) {
  let points = new Array();
  teams.forEach(team => {
    points.push({
      teamId: team.teamId,
      points: team.score,
      compare: function () {
        return this.points;
      },
      display: function () {
        return this.points;
      }
    });
  });
  return points;
}

function calculateRecord(teams) {
  let record = new Array();
  teams.forEach(team => {
    record.push({
      teamId: team.teamId,
      win: team.win,
      loss: team.loss,
      tie: team.tie,
      compare: function () {
        return this.win - this.loss;
      },
      display: function () {
        return this.win + "-" + this.loss + "-" + this.tie;
      }
    });
  });
  return record;
}

function calculateBreakdown(teams) {
  let breakdown = new Array();
  teams.forEach(first => {
    let win = 0,
      loss = 0,
      tie = 0;
    teams.forEach(second => {
      if (first.teamId != second.teamId) {
        if (first.score === second.score) tie++;
        else if (first.score > second.score) win++;
        else loss++;
      }
    });
    breakdown.push({
      teamId: first.teamId,
      win: win,
      loss: loss,
      tie: tie,
      compare: function () {
        return this.win - this.loss;
      },
      display: function () {
        return this.win + "-" + this.loss + "-" + this.tie;
      }
    });
  });
  return breakdown;
};


function squashPoints(data) {
  data[0].points.forEach(first => {
    for (let index = 1; index < data.length; index++) {
      data[index].points.forEach(second => {
        if(first.teamId === second.teamId) {
          first.points += second.points;
        }
      });
    }
  });
  return data[0].points;
}

function squashRecords(data) {
  data[0].records.forEach(first => {
    for (let index = 1; index < data.length; index++) {
      data[index].records.forEach(second => {
        if(first.teamId === second.teamId) {
          first.win += second.win;
          first.loss += second.loss;
          first.tie += second.tie;
        }
      });
    }
  });
  return data[0].records;
}

function squashBreakdowns(data) {
  data[0].breakdowns.forEach(first => {
    for (let index = 1; index < data.length; index++) {
      data[index].breakdowns.forEach(second => {
        if(first.teamId === second.teamId) {
          first.win += second.win;
          first.loss += second.loss;
          first.tie += second.tie;
        }
      });
    }
  });
  return data[0].breakdowns;
}

module.exports = router;
