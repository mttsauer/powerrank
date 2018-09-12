var express = require("express");
const superagent = require("superagent");
var jsonQuery = require("json-query");
const asyncHandler = require("express-async-handler");

var router = express.Router();

/* GET users listing. */
router.get(
  "/:leagueId/:seasonId/:matchupPeriodId",
  asyncHandler(async (req, res, next) => {
    var teams = {};
    superagent
      .get(
        generateUrl(
          req.params.leagueId,
          req.params.seasonId,
          req.params.matchupPeriodId
        )
      )
      .end((err, response) => {
        if (err) {
          console.log(err);
          return;
        }
        matchupPeriod = jsonQuery("scoreboard.matchupPeriodId", {
          data: response.body
        }).value;

        teams = jsonQuery("scoreboard.matchups.teams", { data: response.body })
          .value;

        points = new Array();
        records = new Array();
        breakdowns = new Array();

        teams.forEach(team => {
          points.push({
            teamId: team.teamId,
            name: team.team.teamLocation + " " + team.team.teamNickname,
            compare: function() {
              return team.team.record.pointsFor;
            },
            display: function() {
              return team.team.record.pointsFor;
            }
          });
          records.push({
            teamId: team.teamId,
            name: team.team.teamLocation + " " + team.team.teamNickname,
            compare: function() {
              return (
                (team.team.record.overallWins || 0) -
                (team.team.record.overallLosses || 0)
              );
            },
            display: function() {
              return (
                (team.team.record.overallWins || 0) +
                "-" +
                (team.team.record.overallLosses || 0)
              );
            }
          });
        });

        //Replace with async call to all previous periods
        breakdowns = calculateBreakdown(teams);
        //breakdowns = getBreakdowns(matchupPeriod, req.params.leagueId, req.params.seasonId)

        rank(breakdowns);
        rank(points);
        rank(records);

        ranks = new Array();
        points.forEach(pointElement => {
          breakdownElement =
            jsonQuery("[teamId=" + pointElement.teamId + "]", {
              data: breakdowns
            }).value || {};
          recordElement = jsonQuery("[teamId=" + pointElement.teamId + "]", {
            data: records
          }).value;
          ranks.push({
            name: pointElement.name,
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
            compare: function() {
              return this.powerPoints;
            }
          });
        });

        rank(ranks);
        res.render("powerrank", { ranks: ranks });
      });
  })
);

rank = function(data = {}) {
  allVals = new Array();
  data.forEach(element => {
    allVals.push(element.compare());
  });
  allVals.sort(function(a, b) {
    return a - b;
  });
  aCount = new Map(
    [...new Set(allVals)].map(x => [x, allVals.filter(y => y === x).length])
  );
  data.forEach(element => {
    //Can we use aCount.value to average the position within indexOf?
    element.rank =
      data.length -
      (allVals.indexOf(element.compare()) +
        (aCount.get(element.compare()) - 1));
  });
  data.sort(function(a, b) {
    return a.rank - b.rank;
  });
  console.log("completing rank");
};

generateUrl = function(leagueId, seasonId, matchupPeriodId) {
  return (
    "http://games.espn.com/ffl/api/v2/scoreboard?leagueId=" +
    leagueId +
    "&seasonId=" +
    seasonId +
    "&matchupPeriodId=" +
    matchupPeriodId
  );
};

async function getBreakdowns(matchupPeriod, leagueId, seasonId, callback) {
  const myArray = [];
  for (let index = matchupPeriod; index > 0; index--) {
    myArray.push(index);
  }

  let finalArray = myArray.map(async value => {
    // map instead of forEach
    const result = await getSingleBreakdownPeriod(value, leagueId, seasonId);
    finalValue.asyncFunctionValue = result.asyncFunctionValue;
    return finalValue; // important to return the value
  });
  const resolvedFinalArray = await Promise.all(finalArray); // resolving all promises
  return resolvedFinalArray;
}

async function getSingleBreakdownPeriod(matchupPeriod, leagueId, seasonId) {
  return superagent
    .get(generateUrl(leagueId, seasonId, matchupPeriod))
    .then((err, response) => {
      if (err) {
        console.log(err);
        return;
      }

      periodTeams = jsonQuery("scoreboard.matchups.teams", {
        data: response.body
      }).value;

      return calculateBreakdown(teams);
    });
}

calculateBreakdown = function(teams) {
  let breakdown = new Array();
  teams.forEach(first => {
    let win = 0,
      loss = 0,
      tie = 0;
    teams.forEach(second => {
      if (first.teamId != second.teamId) {
        if (first.score == second.score) tie++;
        if (first.score > second.score) win++;
        else loss++;
      }
    });
    breakdown.push({
      teamId: first.teamId,
      name: first.team.teamLocation + " " + first.team.teamNickname,
      win: win,
      loss: loss,
      tie: tie,
      compare: function() {
        return this.win - this.loss;
      },
      display: function() {
        return this.win + "-" + this.loss + "-" + this.tie;
      }
    });
  });
  return breakdown;
};

module.exports = router;
