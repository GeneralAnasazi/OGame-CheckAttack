// ==UserScript==
// @name        CheckAttack
// @namespace   https://github.com/GeneralAnasazi
// @author      GeneralAnasazi
// @description Plug in anti bash
// @include *ogame.gameforge.com/game/*
// @include about:addons
// @version 3.3.0.31
// @grant		GM_getValue
// @grant		GM_setValue
// @grant		GM_deleteValue
// @grant       GM_xmlhttpRequest
// @require     http://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js

// ==/UserScript==
/*jshint esversion: 6 */

"use strict";
"use moz";


//#region  CONSTANTS

const COOKIE_EXPIRES_DAYS = 1;
const ERROR = 'Error';
const TABID_SPY_REPORT = 20;
const TABID_COMBAT_REPORT = 21; // combat report

//TODO: look for other universe with included espionage attacks
const UNIVERSE_ESPIONAGE_ATTACKS = [
    { universeId: "s150", language: "de" }
];

const DIV_DIALOG_PLACEHOLDER = "id_check_attack_dialog_div";
const DIV_STATUS_GIF_ID = "id_check_attack_status_div";
const DIV_STATUS_ID = "id_check_attack";
const LINKS_TOOLBAR_BUTTONS_ID = "links";
const SPAN_STATUS_ID = "id_check_attack_status";
// has to be set after an update
const VERSION_SCRIPT = '3.3.0.31';
// set VERSION_SCRIPT_RESET to the same value as VERSION_SCRIPT to force a reset of the local storage
const VERSION_SCRIPT_RESET = '3.3.0.28';

// debug consts
const DEBUG = true; // set it to true enable debug messages -> log(msg)
const RESET_COOKIES = false;

//#endregion

//#region  Global Vars
var test = true;
var cssTest = false;

// globale vars
var calculateRess = false;
var divDialogPlaceholder = createDiv(DIV_DIALOG_PLACEHOLDER);
var language = document.getElementsByName('ogame-language')[0].content;
var playerName = document.getElementsByName('ogame-player-name')[0].content;
var sendFleetList = new SendFleetList();
var sendFleetPage = -1;
var universeId = document.getElementsByName('ogame-player-name')[0].content.split("-")[0];

// translation vars (don't translate here)
var captionAttack = "attaque";
var captionAttacks = "attaques";
var loadStatusCR = "loading CR";
var loadStatusSR = "loading SR";
var settingsDialogCaption = "Optionen";
var title1 = "Pas de risque";
var title2 = "de bash";
var title3 = "Risque de bash";
var confirmResetData = "Wollen sie wirklich die gespeicherten Daten zurück setzen?";

//#endregion

//#region ENUMERATIONS

    var bashState = {
        UNDECLARED: -999,
        OWN_DEFENSE: -3,
        AKS_DEFENSE: -2,
        NOTHING_FOUND: -1,
        INACTIVE_PLAYER: 0,
        ESPIONAGE_NO_DETAILS: 1, // espionage but no details to look for the used ships
        ESPIONAGE_PROBE_ATTACK: 2, // only espionage probe
        ESPIONAGE_ATTACK: 3, // sended as espionage with battleships
        AKS_ATTACK: 4,
        NO_DETAILS: 5, // no datails and no spy report found -> counts as an attack
        ATTACK: 99
    };

    var missionState = {
        EXPEDITION: 0,
        COLONIZE: 1,
        RECYCLE: 2,
        TRANSPORT: 3,
        STATIONARY: 4,
        ESPIONAGE: 5,
        HOLD: 6,
        ATTACK: 7,
        ALLIANCE_ATTACK: 8,
        DESTROY_MOON: 9
    };

    var unitIds = {
        LITLE_TRANSPORTER: 202,
        BIG_TRANSPORTER: 203,
        LIGHT_HUNTER: 204,
        HEAVY_HUNTER: 205,
        CRUISER: 206,
        BATTLESHIP: 207,
        COLONIZESHIP: 208,
        RECYCLER: 209,
        ESPIONAGE_PROBE: 210,
        BOMBER: 211,
        DESTROYER: 213,
        DEATHSTAR: 214,
        BATTLECRUISER: 215,
        ROCKET_LAUNCHER: 401,
        LIGHT_LASER: 402,
        HEAVY_LASER: 403,
        GAUSS_CANON: 404,
        ION_CANON: 405,
        PLASMA_CANON: 406,
        LITLE_SHIELD_DOME: 407,
        BIG_SHIELD_DOME: 408,
        INTERCEPTOR_ROCKET: 502,
        INTERPLANETARY_ROCKET: 503
    };

//#endregion

//#region global Objects
// async object
var asyncHelper = {
    currentPage: -1,
    errors: 0,
    lastCheck: getBashTimespan(),
    maxErrors: 10,
    maxPage: -1,
    tabId: -1,

    // *** METHODS ***
    // finish the async process and set default values
    clearAsync: function() {
        if (this.started())
        {
            switch(this.tabId)
            {
                case TABID_SPY_REPORT:
                    settings.lastCheckSpyReport = this.lastCheck;
                    break;
                case TABID_COMBAT_REPORT:
                    settings.lastCheckCombatReport = this.lastCheck;
                    break;
            }
            settings.write();
            this.currentPage = -1;
            this.lastCheck = getBashTimespan();
            this.maxPage = -1;
            this.tabId = -1;
        }
    },
    // to initialize an async action
    startAsync: function(tabId) {
        this.currentPage = 1;
        this.lastCheck = getBashTimespan();
        this.maxPage = 0;
        this.tabId = tabId;
        switch (this.tabId)
        {
            case TABID_SPY_REPORT:
                setStatus(loadStatusSR);
                break;
            case TABID_COMBAT_REPORT:
                setStatus(loadStatusCR);
                break;
        }
    },
    // is an async process started
    started: function() {
        return (this.currentPage > -1 && this.maxPage > -1);
    }
};

/** Main object to handle the data */
var main = {
    combatReports: new CombatReportList(),
    farms: new FarmList("FarmList"),
    recycleReports: new RecycleReportList(),
    spyReports: new SpyReportList(),
    totalRessources: new TotalRessources(),
    // async help var
    reading: false,

    /***** METHODS */
    _init: function() {
        this.combatReports.onNewReport = this._onNewReport;
        this.recycleReports.onNewReport = this._onNewReport;
    },
    _onNewReport: function(report) {
        try
        {
            log('new report add to farms');
            main.farms.add(report);
        }
        catch (ex)
        {
            console.log("Error on main._onNewReport: " + ex);
        }
    },

    calc: function() {
        log('start calc');
        this.totalRessources.clear();
        this.totalRessources.calcReports(this.combatReports, getBashTimespan());
        this.totalRessources.calcReports(this.recycleReports, getBashTimespan());
        this.totalRessources.calcTotal();
        this.totalRessources.save();
        calculateRess = false;
    },
    getDateInfo: function(date) {
        var result = {};
        result.date = date;
        result.coord = null;
        return result;
    },
    getRessourceReports: function(info) {
        var result = new ReportList();
        result.addRange(this.combatReports);
        result.addRange(this.recycleReports);
        if (info) {
            var filterFunc = el =>  el.info && el.info.date.getTime() > info.date.getTime() && 
                                    (el.info.coord == info.coord || info.coord === null) && 
                                    (el.info.moon == info.moon || el.defenderName == undefined);
            result.filterReports(filterFunc);
        }
        return result;
    },
    load: function() {
        this.combatReports.loadFromLocalStorage();
        this.farms.loadFromLocalStorage();
        this.recycleReports.loadFromLocalStorage();
        this.spyReports.loadFromLocalStorage();
        this.totalRessources.load();

        //add new reports
        if (this.farms.items.length === 0)
        {
            this.farms.addRange(this.combatReports);
            this.farms.addRange(this.recycleReports);
        }
        log(this.farms);
    },
    save: function() {
        this.spyReports.saveToLocalStorage();
        if (this.combatReports.saveToLocalStorage() || this.recycleReports.saveToLocalStorage() || calculateRess)
        {
            this.calc();
            if (this.combatReports.updated)
                this.combatReports.saveToLocalStorage();
        }
        this.farms.saveToLocalStorage();
    },
    showFarmReports: function(startDate, endDate) {
        var reportList = new ReportList();
        for (var i = 0; i < this.farms.items.length; i++)
        {
            reportList.add(new FarmReport(this.farms.items[i], startDate, endDate));
        }
        reportList.sortByRessources(true);
        
        var total = new FarmReport();
        total.name = "Total";
        total.ressources = new Ressources();
        reportList.show(el => el.name != playerName, "Farm Liste", '<tr><th>Name</th><th>Metal</th><th>Crystal</th><th>Deuterium</th></tr>', total);
    },
    start: function() {
        this.reading = true;
    },
    stop: function() {
        if (this.reading && this.combatReports.detailsLoadCount == -1)
        {
            this.reading = false;
            var spyReportUpdated = this.spyReports.updated;
            var recycleOrCombatReportUpdated = this.combatReports.updated || this.recycleReports.updated;
            asyncHelper.clearAsync();

            if (spyReportUpdated || recycleOrCombatReportUpdated || calculateRess)
            {
                if (calculateRess)
                {
                    this.combatReports.calcAttackStates(this.spyReports);
                }
                this.save();
                display();
            }
        }
    }
};
main._init();

var localeSettings = {
    decimalSeperator: '',
    thousandSeperator: '',
    load: function() {
        var number = 543.54;
        var localeStr = number.toLocaleString();
        if (localeStr.includes(','))
        {
            this.decimalSeperator = ',';
            this.thousandSeperator = '.';
        }
        else
        {
            this.decimalSeperator = '.';
            this.thousandSeperator = ',';
        }
    },
    parseFloat: function(str) {
        var result = -1;
        var strNumber = str.replace(this.thousandSeperator, '');
        if (this.decimalSeperator == ',')
        {
            strNumber = strNumber.replace(',', '.');
        }
        var isMillion = strNumber.includes('M');
        result = parseFloat(strNumber);
        if (isMillion)
        {
            log('is Million: ' + strNumber + ' Result: ' + result);
            result = result * 1000 * 1000;
        }
        log('end result: ' + result);
        return result;
    }
};

// getTranslation from OGame
var ressourceTitles = {
    metal: '',
    crystal: '',
    deuterium: '',
    total: 'Total',
    isLoaded: function() {
        return (this.metal !== '' && this.crystal !== '' && this.deuterium !== '');
    },
    load: function (arr) {
        try
        {
            log(arr);
            this.metal = arr[1].split(': ')[0];
            this.crystal = arr[2].split(': ')[0];
            this.deuterium = arr[3].split(': ')[0];
        }
        catch (ex)
        {
            console.log('Error on ressourceTitles.load(arr): ' + ex);
        }
    },
    read: function() {
        var obj = loadFromLocalStorage('TranslationRessources');
        if (obj)
        {
            this.metal = obj.metal;
            this.crystal = obj.crystal;
            this.deuterium = obj.deuterium;
        }
    },
    write: function() {
        writeToLocalStorage(this, 'TranslationRessources');
    }
};

// settings object
var settings = {
    farmDays: 7,
    // last readed message from combat report
    lastCheckCombatReport: getBashTimespan(),
    // last readed message from spy report
    lastCheckSpyReport: getBashTimespan(),
    lastVersion: '0',
    isNewVersion: function() {
        return compareVersion(this.lastVersion, VERSION_SCRIPT) < 0;
    },
    load: function() {
        var obj = loadFromLocalStorage('Settings');
        if (obj)
        {
            this.farmDays = obj.farmDays;
            if (obj.lastCheckCombatReport)
            {
                this.lastCheckCombatReport = new Date(obj.lastCheckCombatReport);
            }
            if (obj.lastCheckSpyReport)
            {
                this.lastCheckSpyReport = new Date(obj.lastCheckSpyReport);
            }
            if (obj.lastVersion)
            {
                this.lastVersion = obj.lastVersion;
            }
        }
    },
    showDialog: function() {

    },
    write: function() {
        this.lastVersion = VERSION_SCRIPT;
        writeToLocalStorage(this, 'Settings');
    }
}; // cookie tabSettings

//#region unitCosts
var unitCosts = {};
unitCosts[unitIds.LITLE_TRANSPORTER] = {metal: 2000, crystal: 2000, deuterium: 0};
unitCosts[unitIds.BIG_TRANSPORTER] = {metal: 6000, crystal: 6000, deuterium: 0};
unitCosts[unitIds.LIGHT_HUNTER] = {metal: 3000, crystal: 1000, deuterium: 0};
unitCosts[unitIds.HEAVY_HUNTER] = {metal: 6000, crystal: 4000, deuterium: 0};
unitCosts[unitIds.CRUISER] = {metal: 20000, crystal: 7000, deuterium: 2000};
unitCosts[unitIds.BATTLESHIP] = {metal: 45000, crystal: 15000, deuterium: 0};
unitCosts[unitIds.COLONIZESHIP] = {metal: 10000, crystal: 20000, deuterium: 10000};
unitCosts[unitIds.RECYCLER] = {metal: 10000, crystal: 6000, deuterium: 2000};
unitCosts[unitIds.ESPIONAGE_PROBE] = {metal: 0, crystal: 1000, deuterium: 0};
unitCosts[unitIds.BOMBER] = {metal: 50000, crystal: 25000, deuterium: 15000};
unitCosts[unitIds.DESTROYER] = {metal: 60000, crystal: 50000, deuterium: 15000};
unitCosts[unitIds.DEATHSTAR] = {metal: 5000000, crystal: 4000000, deuterium: 1000000};
unitCosts[unitIds.BATTLECRUISER] = {metal: 30000, crystal: 40000, deuterium: 15000};
unitCosts[unitIds.ROCKET_LAUNCHER] = {metal: 2000, crystal: 0, deuterium: 0};
unitCosts[unitIds.LIGHT_LASER] = {metal: 1500, crystal: 500, deuterium: 0};
unitCosts[unitIds.HEAVY_LASER] = {metal: 6000, crystal: 2000, deuterium: 0};
unitCosts[unitIds.GAUSS_CANON] = {metal: 20000, crystal: 15000, deuterium: 2000};
unitCosts[unitIds.ION_CANON] = {metal: 2000, crystal: 6000, deuterium: 0};
unitCosts[unitIds.PLASMA_CANON] = {metal: 50000, crystal: 50000, deuterium: 30000};
unitCosts[unitIds.LITLE_SHIELD_DOME] = {metal: 10000, crystal: 10000, deuterium: 0};
unitCosts[unitIds.BIG_SHIELD_DOME] = {metal: 50000, crystal: 50000, deuterium: 0};
unitCosts[unitIds.INTERCEPTOR_ROCKET] = {metal: 8000, crystal: 0, deuterium: 2000};
unitCosts[unitIds.INTERPLANETARY_ROCKET] = {metal: 12500, crystal: 2500, deuterium: 10000};
//#endregion

//#endregion

//#region prototype functions

Date.prototype.addMSecs = function(msecs) {
    this.setTime(this.getTime() + msecs);
    return this;
};

Date.prototype.addHours = function(hours) {
    this.addMSecs(hours * 60 * 60 * 1000);
    return this;
};

String.prototype.replaceAll = function (searchStr, replacement)
{
    return this.split(searchStr).join(replacement);
};

String.prototype.trim = function (string)
{
    return this.replace(/(^\s*)|(\s*$)/g,'');
};

//#endregion

//#region CONSTRUCTORS

function Attacks(combatReport) {
    /***** PROPERTIES *****/
    this.attackTimes = [];
    this.coord = '';
    this.count = 0;
    this.defenderName = 'Unknown';
    this.moon = false;
    /***** METHODS *****/
    this.addAttack = function(combatReport) {
        if (combatReport)
        {
            this.attackTimes.push(combatReport.info.date);
            this.coord = combatReport.info.coord;
            if (combatReport.defenderName != 'Unknown')
                this.defenderName = combatReport.defenderName;
            this.moon = combatReport.info.moon;
            this.count++;
        }
    };
    this.getTimesStr = function() {
        var result = '';
        if (this.attackTimes)
        {
            for (var i = 0; i < this.attackTimes.length; i++)
            {
                if (result !== '')
                    result += '\n';
                result += this.attackTimes[i].toISOString();
            }
        }
        return result;
    };
    this.setValues = function(attack) {
        log(attack);
        for (var i = 0; i < attack.attackTimes.length; i++)
            this.attackTimes.push(new Date(attack.attackTimes[i]));
        this.coord = attack.coord;
        this.count = attack.count;
        this.defenderName = attack.defenderName;
        this.moon = attack.moon;
    };
    this.toHtml = function() {
        // create an object for later use
        var obj = {};
        obj.date = getBashTimespan();
        obj.defenderName = this.defenderName;
        obj.coord = this.coord;
        obj.moon = this.moon;
        var json = JSON.stringify(obj).replaceAll('"', '&quot;');

        var defenderSpan = '<span style="font-weight: bold; color: grey;display: inline-block;float: center;text-align: center" data-info="'+json+'">' + this.defenderName + '</span>';
        var btn = createButton(defenderSpan, "attackTrackerButton");
        if (this.moon)
            defenderSpan += '<img src="https://github.com/GeneralAnasazi/OGame-CheckAttack/raw/master/Moon.gif" style="height: 14px; width: 14px;float: right;">';
        return '<a title="' + this.getTimesStr() + ' (time in UTC)" href="' + coordToUrl(this.coord)+'" style="display: inline-block;width: 58px;text-align: left">' + this.coord + '</a>' + btn.outerHTML + '<br/>';
    };

    // on create
    this.addAttack(combatReport);
}

function AttackTracker() {
    /***** PROPERTIES *****/
    this.attacks = [];

    /***** METHODS *****/
    this.addAttack = function(combatReport) {
        var idx = this.attacks.findIndex(el => el.coord == combatReport.info.coord && el.moon == combatReport.info.moon);
        if (idx > -1)
        {
            this.attacks[idx].addAttack(combatReport);
        }
        else
            this.attacks.push(new Attacks(combatReport));
    };
    this.clear = function() {
        this.attacks = [];
    };
    this.sortAttacks = function() {
        if (this.attacks)
        {
            this.attacks.sort(function(left, right){
                var result = 0;
                if (left.count < right.count)
                    result = 1;
                else if (left.count > right.count)
                    result = -1;
                else
                {
                    result = left.coord.localeCompare(right.coord);
                }
                return result;
            });
        }
    };
    this.read = function() {
        this.clear();
        var obj = loadFromLocalStorage('AttackTracker');
        if (obj)
        {
            for (var i = 0; i < obj.attacks.length; i++)
            {
                if (obj.attacks[i])
                {
                    var att = new Attacks();
                    att.setValues(obj.attacks[i]);
                    this.attacks.push(att);
                }
            }
        }
    };
    this.toHtml = function() {
        var result = '';
        for (var i = 0; i < this.attacks.length; i++)
        {
            result += this.attacks[i].toHtml();
        }
        return result;
    };
    this.write = function() {
        this.sortAttacks();
        writeToLocalStorage(this, 'AttackTracker');
    };
}

function CombatReport(msg) {
    Report.call(this); // inherited
    this.attackerName = 'Unknown';
    this.debrisField = 0;
    this.defenderInactive = false;
    this.defenderName = 'Unknown';
    this.details = null;
    this.fleetIds = null;
    this.isAttacker = null;
    this.isDefender = null;
    this.ressourcesLoot = null;
    this.ressourcesLost = null;
    this.status = bashState.UNDECLARED;
    /***** METHODS *****/ {
    this.calcLosses = function(units, repairedDefense) {
        var result = new Ressources();
        for (var id in units)
        {
            if (unitCosts[id])
            {
                if (id < 400)
                    result.add(unitCosts[id], parseInt(units[id]));
                else if (repairedDefense)
                {
                    var defenseValue = parseInt(units[id]) - parseInt(repairedDefense[id]);
                    result.add(unitCosts[id], defenseValue);
                }
            }
        }
        return result;
    };
    this.calcLost = function() {
        var result = new Ressources();
        if (this.details)
        {
            try
            {
                if (!this.fleetIds)
                    this.getFleetId();

                var idx = this.details.combatRounds.length - 1;
                var losses = this.details.combatRounds[idx].attackerLosses;
                if (this.isDefender)
                    losses = this.details.combatRounds[idx].defenderLosses;
                var repairedDefense = null;
                if (this.isDefender)
                    repairedDefense = this.details.repairedDefense;

                if (losses)
                {
                    for (var i = 0; i < this.fleetIds.length; i++)
                    {
                        var fleetId = this.fleetIds[i];
                        var ress = this.calcLosses(losses[fleetId], repairedDefense);
                        result.add(ress);
                    }
                    this.ressourcesLost = result;
                }
            }
            catch (ex)
            {
                console.log("Error on CombatReport.calcLost: " + ex);
                log(this);
            }
        }
        return result;
    };
    this.detailsLoaded = function(spyReportList, reportList) {
        var result = false;
        if (this.details)
        {
            this.details.attackerJSON = undefined; // parsed and not needed
            this.details.defenderJSON = undefined; // parsed and not needed
            try
            {
                this.getFleetId();
                this.calcLost();
                // get loot
                this.ressourcesLoot = new Ressources();
                this.ressourcesLoot.metal = this.details.loot.metal;
                this.ressourcesLoot.crystal = this.details.loot.crystal;
                this.ressourcesLoot.deuterium = this.details.loot.deuterium;
            }
            catch (ex)
            {
                console.log("Error on CombatReport.detailsLoaded: " + ex);
                log(this);
            }
        }
        var status = spyReportList.getStatus(this);
        if (status != this.status)
        {
            this.status = status;
            result = true;
        }
        this.defenderInactive = this.status == bashState.INACTIVE_PLAYER;
        if (reportList)
            reportList.onNewReport(this);

        return result;
    };
    this.getDetails = function() {
        if (this.info.id && !this.details)
        {
            getMessageDetailsAsync(this.info.id);
            main.combatReports.detailsLoadCount++;
        }
    };
    this.getFleetId = function() {
        var result = [];
        if (this.fleetIds)
            return this.fleetIds;
        if (this.details)
        {
            this.isDefender = false;
            var fleetId = -1;
            for (var id in this.details.attacker)
            {
                if (this.details.attacker[id].ownerName == playerName)
                {
                    fleetId = parseInt(this.details.attacker[id].fleetID);
                    this.isAttacker = true;
                    result.push(fleetId);
                }
            }
            for (var defenderId in this.details.defender)
            {
                var defender = this.details.defender[defenderId];
                if (defender.ownerName == playerName)
                {
                    fleetId = parseInt(defender.fleetID);
                    result.push(fleetId);
                    this.isDefender = true;
                }
            }
            this.fleetIds = result;
        }
        return result;
    };
    this.getCombatInfo = function(msg, className) {
        var result = 'Unknown';

        var div = msg.getElementsByClassName(className)[0];
        if (div)
        {
            var combatInfo = div.getElementsByClassName('msg_ctn');
            if (combatInfo[0])
            {
                var name = combatInfo[0].innerHTML;
                result = name.split(': ')[1].replace('(', '').replace(')', '').trim();
                if (combatInfo.length > 2)
                {
                    if (className == "combatLeftSide")
                    {
                        this.ressources = new Ressources(combatInfo[1]);
                        this.debrisField = extractRess(combatInfo[2].innerHTML);
                    }
                }
            }
        }
        return result;
    };
    this.isBash = function() {
        if (UNIVERSE_ESPIONAGE_ATTACKS.find(el => el.universeId = universeId))
            return parseInt(this.status) > parseInt(bashState.ESPIONAGE_NO_DETAILS);
        else
            return parseInt(this.status) > parseInt(bashState.ESPIONAGE_PROBE_ATTACK);
    };
    this.load = function(msg) {
        var result = false;
        try
        {
            if (msg)
            {
                this.info = new ReportInfo(msg);
                this.defenderName = this.getCombatInfo(msg, "combatRightSide");
                if (this.defenderName == playerName)
                    this.isDefender = true;

                this.attackerName = this.getCombatInfo(msg, "combatLeftSide");
            }
        }
        catch (ex)
        {
            console.log('Error on CombatReport.load(msg): ' + ex);
        }
        return result;
    };
    this.onlyEspionageProbe = function() {
        var result = false;
        if (this.details)
        {
            for (var i = 0; i < this.fleetIds; i++)
            {
                var fleetId = this.fleetIds[i];
                var shipList = this.details.attacker[fleetId];
                if (shipList)
                {
                    result = true;
                    for (var id in shipList.shipDetails)
                    {
                        if (unitIds.ESPIONAGE_PROBE != id)
                        {
                            result = result && parseInt(shipList.shipDetails[id]) === 0;
                        }
                    }
                }
            }
        }
        else
        {
            result = true;
        }
        return result;
    };
    this.setValues = function(obj) {
        this._setValues(obj);
        if (obj.attackerName)
			this.attackerName = obj.attackerName.trim();
        this.debrisField = obj.debrisField;
        this.defenderInactive = obj.defenderInactive;
		if (obj.defenderName)
	        this.defenderName = obj.defenderName.trim();
        this.details = obj.details;
        this.fleetIds = obj.fleetIds;
        this.isAttacker = obj.isAttacker;
        this.isDefender = obj.isDefender;
        if (obj.ressourcesLost)
        {
            this.ressourcesLost = new Ressources();
            this.ressourcesLost.setValues(obj.ressourcesLost);
        }
        if (obj.ressourcesLoot)
        {
            this.ressourcesLoot = new Ressources();
            this.ressourcesLoot.setValues(obj.ressourcesLoot);
        }
        this.status = obj.status;
    };}
    // load from message
    if (msg)
        this.load(msg);
}
CombatReport.prototype = Object.create(Report.prototype);
CombatReport.prototype.constructor = CombatReport;

function CombatReportList() {
	ReportList.call(this, 'CombatReportList', getBashTimespan(-6 * 24 * 60)); // 7 days are stored

    this.detailsLoadCount = -1;

    this.add = function(report) {
		var result = this.reports.findIndex(el => el.info.equal(report.info)) == -1;
		if (result)
		{
            log("combat report added");
            this.reports.push(report);
            this.updated = true;
            if (report.defenderName && !report.details) // prevent loading details for total losts and loaded details
            {
                report.getDetails();
            }
        }
        return result;
    };
    this.calcAttackStates = function(spyList) {
        for (var i = 0; i < this.reports.length; i++)
        {
            var status = spyList.getStatus(this.reports[i]);
            if (this.reports[i].status != status)
            {
                this.reports[i].status = status;
                this.updated = true;
            }
        }
    };
    /** get the bash attacks */
    this.getAttacks = function() {
        var result = new AttackTracker();
        result.clear();
        var bashTimespan = getBashTimespan();

        for (var i = 0; i < this.reports.length; i++)
        {
            //this.combatReports[i].defenderName != playerName && // exclude attacks of your self and attacks from
            if (this.reports[i].isBash()) // exclude total destroyed in the first round
            {
                if (this.reports[i].info.date >= bashTimespan)
                    result.addAttack(this.reports[i]);
                else
                    break;
            }
        }
        result.sortAttacks();
        return result;
    };
	//implement abstract function from ReportList
	this.setValues = function(obj) {
		for (var i = 0; i < obj.reports.length; i++)
		{
			var report = new CombatReport();
			report.setValues(obj.reports[i]);
			this.reports.push(report);
		}
    };
    
}
CombatReportList.prototype = Object.create(ReportList.prototype);
CombatReportList.prototype.constructor = CombatReportList;

function Farm(obj) {
    this.infoList = [];
    this.name = "";
    this.updated = false;

    this.add = function(report) {
        var result = false;
        if (report)
        {
            if (this.name === "" || this.name === "Unknown")
                this.name = report.defenderName;
            var found = this.infoList.find(el => el.apiKey === report.info.apiKey);
            if (!found)
            {
                var info = new FarmInfo(report);
                this.infoList.push(info);
                this.updated = true;
                result = true;
            }
        }
        return result;
    };
    this.calc = function(startDate, endDate) {
        var result = new Ressources();
        var calcList = this.infoList.filter(el => el.date.getTime() >= endDate.getTime() && el.date.getTime() <= startDate.getTime());
        for (var i = 0; i < calcList.length; i++)
            result.add(calcList[i].ressources);
        return result;
    };
    /** Used to check, to find a farm */
    this.findFarmInfo = function(coord) {
        //TODO: Use the OGame API for the planet coords
        var idx = this.infoList.findIndex(el => el.coord === coord);
        if (idx > -1)
            return this.infoList[idx];
        else
            return null;
    };
    this.setValues = function(obj) {
        if (obj)
        {
            this.id = obj.id;
            this.name = obj.name;
            for (var i = 0; i < obj.infoList.length; i++)
            {
                var farmInfo = new FarmInfo();
                farmInfo.setValues(obj.infoList[i]);
                this.infoList.push(farmInfo);
            }
        }
    };
    this.setValues(obj);
}

function FarmInfo(combatReport) {
    this.apiKey = null;
    this.coord = null;
    this.date = new Date();
    this.ressources = new Ressources();

    this.loadFromCR = function(combatReport) {
        this.date = combatReport.info.date;
        this.coord = combatReport.info.coord;
        this.apiKey = combatReport.info.apiKey;
        if (combatReport.ressourcesLoot)
            this.ressources.add(combatReport.ressourcesLoot);
        else
            this.ressources.add(combatReport.ressources);
        this.ressources.dec(combatReport.ressourcesLost);
    };
    this.setValues = function(obj) {
        this.coord = obj.coord;
        this.date = new Date(obj.date);
        this.ressources.setValues(obj.ressources);
    };

    if (combatReport)
        this.loadFromCR(combatReport);
}

function FarmList(storageKey) {
    this.items = [];
    this.updated = false;
    var _storageKey = storageKey;

    this.add = function(report) {
        if ((!report.ressources) || (report.ressources.isEmpty()))
        {
            return;
        }
        var farm = this.findFarm(report.defenderName, report.info.coord);
        if (!farm)
        {
            farm = new Farm();
            
            this.items.push(farm);
            this.updated = true;
        }
        this.updated = farm.add(report) || this.updated;
    };
    this.addRange = function(reportList) {
        for (var i = 0; i < reportList.reports.length; i++)
            this.add(reportList.reports[i]);
    };
    this.findFarm = function(name, coord) {
        var idx = this.items.findIndex(el => (el.name == name && name !== "") || el.findFarmInfo(coord) !== null);
        if (idx > -1)
            return this.items[idx];
        else
            return null;

    };
    this.load = function(groupedReports) {
        for (var i = 0; i < groupedReports.length; i++)
        {
            for (var j = 0; j < groupedReports[i].length; j++)
            {
                this.add(groupedReports[i][j]);
            }
        }
    };
    this.loadFromLocalStorage = function() {
        if (_storageKey)
        {
            var obj = loadFromLocalStorage(_storageKey);
            log(obj);
            if (obj)
            {
                for (var i = 0; i < obj.items.length; i++)
                {
                    var farm = new Farm();
                    farm.setValues(obj.items[i]);
                    this.items.push(farm);
                }
            }
        }
    };
    this.showDialog = function() {

    };
    this.saveToLocalStorage = function() {
        if (_storageKey && this.updated)
        {
            this.updated = false;
            writeToLocalStorage(this, _storageKey);
        }
    };
}

function FarmReport(farm, startDate, endDate) {
    Report.call(this);

    this.name = "";

    this.getRow = function () {
        return '<tr><td>'+this.name+'</td><td>'+this.ressources.metal.toLocaleString()+'</td><td>'+this.ressources.crystal.toLocaleString()+'</td><td>'+this.ressources.deuterium.toLocaleString()+'</td></tr>';
    };
    this.load = function(farm, startDate, endDate) {
        if (farm)
        {
            this.name = farm.name;
            this.info = new ReportInfo();
            this.info.date = new Date();
            if (farm.infoList.length > 0)
                this.info.date = farm.infoList[0].date;
            this.ressources = farm.calc(startDate, endDate);
        }
    };
    // initialize with params
    this.load(farm, startDate, endDate);
}
FarmReport.prototype = Object.create(Report.prototype);
RecycleReport.prototype.constructor = FarmReport;

class ApiLocalization {
    constructor(node) {
        this.id = null;
        this.name = null;
        parse(node);
    }

    parse(node) {
        if (node) {
            this.id = node.getAttribute("id");
            this.name = node.innerText;
        }
    }
}

class OGameAPI {
    constructor() {
        this.readFile = function(filename) {
            const DEFAULT_URL = "/api/";
            //https://s800-en.ogame.gameforge.com/api/localization.xml
            var fileUrl = DEFAULT_URL + filename;
            //TODO: async call load api xml file

            var parser = new DOMParser();
            var xmlDoc = parser.parseFromString(text,"text/xml");
        };
    }

    readFile(filename) {
        const DEFAULT_URL = "/api/";
        //https://s800-en.ogame.gameforge.com/api/localization.xml
        var fileUrl = DEFAULT_URL + filename;
        //TODO: async call load api xml file

        var parser = new DOMParser();
        return parser.parseFromString(text,"text/xml");
    }
}

function RecycleReport(msg) {
    Report.call(this); // inherited

	/*** METHODS ************************************************/
    this.parseMessage = function(msg) {
        if (msg)
        {
            this.info = new ReportInfo(msg);

            var span = msg.getElementsByClassName('msg_content');
            if (span[0])
            {
                var text = span[0].innerHTML;
                var sentences = text.split('. ');
                if (sentences.length > 2 && sentences[sentences.length - 1].includes(ressourceTitles.metal))
                {
                    var words = sentences[2].split(' ');
                    this.ressources = new Ressources();
                    var i = words.length - 1;
                    var metal = ressourceTitles.metal + ': ';
                    var crystal = ressourceTitles.metal + ': ';
                    var deuterium = ressourceTitles.deuterium + ': '; // usally not needed but nobody knows what's happend in the future
                    while (i > -1)
                    {
                        if (words[i] == ressourceTitles.metal)
                        {
                            metal += words[i-1];
                            i -= 2;
                        }
                        else if (words[i] == ressourceTitles.crystal)
                        {
                            crystal += words[i-1];
                            i -= 2;
                        }
                        else if (words[i] == ressourceTitles.deuterium)
                        {
                            deuterium += words[i-1];
                            i -= 2;
                        }
                        else
                            i--;
                    }
                    if (deuterium == ressourceTitles.deuterium + ': ')
                        deuterium += '0';
                    this.ressources.metal = extractRess(metal);
                    this.ressources.crystal = extractRess(crystal);
                    this.ressources.deuterium = extractRess(deuterium);
                    this.ressources.total = this.ressources.metal + this.ressources.crystal + this.ressources.deuterium;
                }
            }
        }
    };
    this.setValues = function(report) {
		this._setValues(report); //inherited
    };

    this.parseMessage(msg);
}
RecycleReport.prototype = Object.create(Report.prototype);
RecycleReport.prototype.constructor = RecycleReport;

function RecycleReportList() {
    ReportList.call(this, 'RecycleReportList', getBashTimespan(-6 * 24 * 60));  // 7 days are stored

    this.setValues = function(obj) {
        for (var i = 0; i < obj.reports.length; i++)
        {
            var report = new RecycleReport();
            report.setValues(obj.reports[i]);
            this.reports.push(report);
        }
    };
}
RecycleReportList.prototype = Object.create(ReportList.prototype);
RecycleReportList.prototype.constructor = RecycleReportList;

/** Default report object */
function Report() {
	this.info = null;
	this.ressources = undefined; // can be used (have a look for super -> call)

    this.getRow = function() {
        var ress = new Ressources();
        if (this.ressourcesLoot)
            ress.add(this.ressourcesLoot);
        else
            ress.add(this.ressources);
        ress.dec(this.ressourcesLost);
        
        var name = "";
        if (this.defenderName)
            name = this.defenderName;
        var coord = "";
        var date = "";
        if (this.info)
        {
            coord = this.info.coord;
            date = formatDate(this.info.date);
        }
        return '<tr><td>'+name+'</td><td>'+coord+'</td><td>'+date+'</td><td>'+ress.metal.toLocaleString()+'</td><td>'+ress.crystal.toLocaleString()+'</td><td>'+ress.deuterium.toLocaleString()+'</td></tr>';
    };
	//pseudo private => implemented to use it for an inhertited function
    this._setValues = function(report) {
        this.info = new ReportInfo();
        this.info.setValues(report.info);
        if (report.ressources)
        {
            this.ressources = new Ressources();
            this.ressources.setValues(report.ressources);
        }
    };

}

function ReportInfo(msg) {
    this.id = null;
    this.apiKey = null;
    this.coord = '';
    this.date = null;
    this.moon = false;
    /***** METHODS *****/ {
    this.equal = function(info) {
        return (this.apiKey !== null && info.apiKey !== null && this.apiKey == info.apiKey) ||
            (this.apiKey === null && info.apiKey === null &&
            this.date.getTime() === info.date.getTime() &&
            this.coord === info.coord && this.moon === info.moon);
    };
    this.equalWithoutApi = function(info) {
        return this.date.getTime() === info.date.getTime() && this.coord === info.coord && this.moon === info.moon;
    };
    this.parseMessage = function(msg) {
        if (msg)
        {
            this.id = msg.getAttribute('data-msg-id');
            this.readApiKey(msg);
            this.coord = this.readCoord(msg);
            this.date = this.readDate(msg);
            this.moon = this.readMoon(msg);
        }
    };
    this.readApiKey = function(msg) {
        var span = msg.getElementsByClassName("icon_apikey")[0];
        if (span)
        {
            var matches = span.outerHTML.match(/[a-z]{2}-[a-z]{2}-[0-9]{1,3}-[a-z0-9]{10,}/g);
            if (matches.length > 0)
                this.apiKey = matches[0];
        }
    };
    this.readCoord = function(msg) {
        var result = '';
        if (msg)
        {
            var locTab = msg.getElementsByClassName('txt_link')[0];
            if (locTab)
            {
                result = locTab.innerHTML;
                if (result.startsWith('<figure class'))
                {
                    result = locTab.text;
                    if (result)
                        result = "[" + result.split(' [')[1];
                }
            }
        }
        return result;
    };
    this.readDate = function(msg) {
        var result = new Date(2000, 0, 1);
        if (msg)
        {
            var msgtab = msg.getElementsByClassName('msg_date');
            var date = msgtab[0];
            if (date)
            {
                var dateStr = String(date.innerHTML);
                var datePart  = dateStr.split(" ")[0].split(".");
                var timePart = dateStr.split(" ")[1].split(":");

                var day = datePart[0];
                var month = datePart[1];
                var year = datePart[2];

                var hour = timePart[0];
                var minutes = timePart[1];
                var seconds = timePart[2];
                result = new Date(year, month - 1, day, hour, minutes, seconds);
            }
            else
            {
                console.log("Error on ReportInfo.readDate(msg): Can't read the date " + msgtab);
            }
        }
        return result;
    };
    this.readMoon = function(msg) {
        // get isPlanet or isMoon
        var result = false;
        if (msg.getElementsByClassName('planetIcon moon')[0])
            result = true;
        return result;
    };
    this.setValues = function(obj) {
        if (obj)
        {
            this.apiKey = obj.apiKey;
            this.coord = obj.coord;
            this.date = new Date(obj.date);
            this.id = obj.id;
            this.moon = obj.moon;
        }
    };}

    this.parseMessage(msg);
}

function ReportList(storageKey, deleteDate) {
    this._deleteDate = deleteDate;
    this._storageKey = storageKey;
    this.reports = [];
    this.updated = false;

    function newReport(list, report) {
        if (list.onNewReport)
        {
            log("try to call the function");
            list.onNewReport(report);
        }
        else
            log(list.onNewReport);
    }

	this.add = function(report) {
		var isNew = this.reports.findIndex(el => el.info.equal(report.info)) == -1;
		if (isNew)
		{
            this.reports.push(report);
            this.updated = true;
            newReport(this, report);
        }
        return isNew;
	};
	this.addRange = function(reportList) {
        if (reportList && reportList.reports)
		{
			for (var i = 0; i < reportList.reports.length; i++)
			{
				this.reports.push(reportList.reports[i]);
			}
		}
	};
	this.clear = function() {
        this.reports = [];
        this.updated = true;
    };
    this.count = function() { return this.reports.length; };
    this.deleteOldReports = function(date) {
        deleteOldReports(this.reports, date);
    };
    this.filterReports = function(filterFunc) {
        this.reports = this.reports.filter(filterFunc);
    };
    this.groupeBy = function(keys) {
        var i = 0, val, index,
        values = [], result = [];
        for (; i < this.reports.length; i++) 
        {
            val = "";
            for (var j = 0; j < keys.length; j++)
            {
                var splitKeys = keys[j].split(".");
                switch (splitKeys.length)
                {
                    case 1:
                        val += this.reports[i][splitKeys[0]];
                        break;
                    case 2:
                        val += this.reports[i][splitKeys[0]][splitKeys[1]];
                    break;
                    case 3:
                        val += this.reports[i][splitKeys[0]][splitKeys[1]][splitKeys[2]];
                    break;
                }
                
            }
            index = values.indexOf(val);
            if (index > -1)
                result[index].push(this.reports[i]);
            else {
                values.push(val);
                result.push([this.reports[i]]);
            }
        }
        return result;

    };
	this.loadFromLocalStorage = function() {
		if (this._storageKey)
		{
			var obj = loadFromLocalStorage(this._storageKey);
			if (obj)
			{
				// this function has to be implemented in other objects (abstract function)
                this.setValues(obj);
                this.updated = false;
			}
		}
    };
    this.onNewReport = function(report) {log("wrong function");};
	this.remove = function(report) {
		var idx = this.reports.findIndex(el => el.info.equal(report.info));
		if (idx > -1)
		{
            this.reports.splice(idx, 1);
            this.updated = true;
		}
	};
	this.saveToLocalStorage = function() {
        var result = false;
		if (this._storageKey)
		{
            this.sortByDateDesc();
            this.deleteOldReports(this._deleteDate);
            if (this.updated)
            {
                log("save " + this._storageKey);
                writeToLocalStorage(this, this._storageKey);
                result = true;
            }
            this.updated = false;
        }
        return result;
    };
    this.show = function(filterFunc, title, headRow, footerReport) {
        var reports = this.reports;
        if (filterFunc)
            reports = reports.filter(filterFunc);
        var headerRow = '<tr><th>Name</th><th>Coord</th><th>Date</th><th>Metal</th><th>Crystal</th><th>Deuterium</th></tr>';
        if (headRow)
            headerRow = headRow;
        var rows =  '<thead>'+headerRow+'</thead><tbody">';
                    
        var total = null;
        if (!footerReport)
        {
            total = new CombatReport();
            total.defenderName = "Total";
            total.ressources = new Ressources();
        }
        else
            total = footerReport;

        for (var i = 0; i < reports.length; i++)
        {
            rows += reports[i].getRow();
            if (!reports[i].ressourcesLoot)
            {
                total.ressources.add(reports[i].ressources);
            }
            total.ressources.add(reports[i].ressourcesLoot);
            total.ressources.dec(reports[i].ressourcesLost);
        }
        rows += '</tbody><tfoot>';
        rows += total.getRow();
        rows += '</tfoot>';
        var aTitle = "Reports";
        if (title)
            aTitle = title;
        showDialog(aTitle, '<div class="datagrid"><table class="scroll">'+rows+'</table></div>');

        if (!cssTest)
            return;
        try
        {
            var $table = $('table.scroll'),
            $bodyCells = $table.find('tbody tr:first').children(),
            colWidth;
            // Get the tbody columns width array
            colWidth = $bodyCells.map(function() {
                return $(this).width();
            }).get();
            
            // Set the width of thead columns
            $table.find('thead tr').children().each(function(i, v) {
                if (i != colWidth.length - 1)
                    $(v).width(colWidth[i]);
            });    

            $table.find('tfoot tr').children().each(function(i, v) {
                if (i != colWidth.length - 1)
                    $(v).width(colWidth[i]);
                else
                    $(v).width(colWidth[i] + 23);
            });
        }
        catch(ex)
        {
            console.log('Error on CombatReportList.show: ' + ex);
        }
    };
    this.sortByDateDesc = function() {
        this.reports.sort(compareByDate);
    };
    this.sortByRessources = function(desc) {
        this.reports.sort(function(left, right) {
            var result = left.ressources.total - right.ressources.total;
            if (desc)
                result = result * -1;
            return result;
        });
    };
}

function Ressources(span) {
    this.metal = 0;
    this.crystal = 0;
    this.deuterium = 0;
    this.total = 0;

    this.add = function(ress, multiplier) {
        if (!ress) return;
        if (!multiplier)
            multiplier = 1;
        this.metal += ress.metal * multiplier;
        this.crystal += ress.crystal * multiplier;
        this.deuterium += ress.deuterium * multiplier;
        this.calcTotal();
    };
    this.calcTotal = function() {
        this.total = this.metal + this.crystal + this.deuterium;
    };
    this.clear = function() {
        this.metal = 0;
        this.crystal = 0;
        this.deuterium = 0;
        this.total = 0;
    };
    this.dec = function(ress) {
        if (ress)
        {
            this.metal -= ress.metal;
            this.crystal -= ress.crystal;
            this.deuterium -= ress.deuterium;
            this.calcTotal();
        }
    };
    this.isEmpty = function() {
        return this.metal === 0 && this.crystal === 0 && this.deuterium === 0;
    };
    this.load = function(span) {
        if (span && span.innerHTML)
        {
            try
            {
                var arr = span.getAttribute('title').split('<br/>');
                if (arr.length > 3)
                {
                    this.metal = extractRess(arr[1]);
                    this.crystal = extractRess(arr[2]);
                    this.deuterium = extractRess(arr[3]);
                    this.total = extractRess(span.innerHTML);
                    if (!ressourceTitles.isLoaded())
                    {
                        ressourceTitles.load(arr);
                    }
                }
            }
            catch (ex)
            {
                console.log('Error Ressources.load(span): ' + ex);
            }
        }
    };
    this.setValues = function(obj) {
        if (obj)
        {
            this.metal = obj.metal;
            this.crystal = obj.crystal;
            this.deuterium = obj.deuterium;
            this.total = obj.total;
        }
    };
    this.toHtml = function(title, className, titleClick) {
        var result = '';
        if (title && className)
        {
            var spanAttr = 'style="padding: 9px;"';
            var innerHtml = getSpanHtml(ressourceTitles.metal + ': ' + this.metal.toLocaleString(), spanAttr) + '</br>';
            innerHtml += getSpanHtml(ressourceTitles.crystal + ': ' + this.crystal.toLocaleString(), spanAttr) + '</br>';
            innerHtml += getSpanHtml(ressourceTitles.deuterium + ': ' + this.deuterium.toLocaleString(), spanAttr) + '</br>';
            innerHtml += getSpanHtml(ressourceTitles.total + ': ' + this.total.toLocaleString(), spanAttr) + '</br>';
            result = getTitle(className, title, titleClick, innerHtml);
        }
        return result;
    };

    this.load(span);
}

function SendFleet(storageKey) {
    this.deuterium = null;
    this.infoFrom = null; // reportInfo
    this.infoTo = null; // reportInfo
    this.mission = null; // missionState
    this.page = null;
    this.ships = {};
    this.storageKey = null;

    this.delete = function() {
        deleteValueLocalStorage(this.storageKey);
    };
    this.parse = function(page) {
        //on send ships read all the data to know what is sended
        try
        {
            this.page = page;
            switch (page)
            {
                case 1:
                    this.parseShips();
                    break;
                case 3:
                    this.parseMission();
                    break;
            }
        }
        catch (ex)
        {
            alert(ex);
        }
    };
    this.parseMission = function() {
        var ul = document.getElementById("missions");
        if (ul)
        {
            var li = ul.getElementsByClassName("on")[0];
            if (li)
            {
                var attr = li.getAttribute("id");
                switch(attr)
                {
                    case "button15":
                        this.mission = missionState.EXPEDITION;
                        break;
                    case "button7":
                        this.mission = missionState.COLONIZE;
                        break;
                    case "button8":
                        this.mission = missionState.RECYCLE;
                        break;
                    case "button3":
                        this.mission = missionState.TRANSPORT;
                        break;
                    case "button4":
                        this.mission = missionState.STATIONARY;
                        break;
                    case "button6":
                        this.mission = missionState.ESPIONAGE;
                        break;
                    case "button5":
                        this.mission = missionState.HOLD;
                        break;
                    case "button1":
                        this.mission = missionState.ATTACK;
                        break;
                    case "button2":
                        this.mission = missionState.ALLIANCE_ATTACK;
                        break;
                    case "button9":
                        this.mission = missionState.DESTROY_MOON;
                        break;
                }
            }
        }
        var divWrap = document.getElementById("wrap");
        if (divWrap)
        {
            var consumption = document.getElementById("consumption").getElementsByTagName("span")[0];
            if (consumption && consumption.textContent)
            {
                this.deuterium = extractRess(consumption.textContent.split(" ")[0]);
            }
            this.parseReportInfo(divWrap);
        }
    };
    this.parseReportInfo = function(div) {
        var inputList = div.getElementsByClassName("value");
        if(inputList.length > 0)
        {
            this.infoTo = new ReportInfo();
            this.infoTo.coord = "[" + inputList[0].textContent.split('[')[1].split(']')[0] + "]";
            this.infoTo.readMoon(inputList[0]);
            var arrivalTime = parseInt(document.getElementById("aks").getAttribute("data-arrival-time"));
            this.infoTo.date = new Date(arrivalTime);
        }
    };
    this.parseShips = function() {
        this.parseShipValues("military");
        this.parseShipValues("civil");
    };
    this.parseShipValues = function(divId) {
        var div = document.getElementById(divId);
        if (div)
        {
            var inputList = div.getElementsByClassName("fleetValues");
            for (var i = 0; i < inputList.length; i++)
            {
                var shipId = parseInt(inputList[i].getAttribute("id").split('_')[1]);
                this.ships[shipId] = parseInt(inputList[i].value);
            }
        }
    };
    this.read = function() {
        var obj = loadFromLocalStorage(this.storageKey);
        if (obj)
        {
            this.setValues(obj);
        }
    };
    this.setValues = function(obj) {
        this.deuterium = obj.deuterium;
        if (obj.infoFrom)
        {
            this.infoFrom = new ReportInfo();
            this.infoFrom.setValues(obj.infoFrom);
        }
        if (obj.infoTo)
        {
            this.infoTo = new ReportInfo();
            this.infoTo.setValues(obj.infoTo);
        }
        this.mission = obj.mission;
        this.page = obj.page;
        this.ships = obj.ships;
        this.storageKey = obj.storageKey;
    };
    this.write = function() {
        writeToLocalStorage(this, this.storageKey);
    };

    if (storageKey)
    {
        this.storageKey = storageKey;
        this.read();
    }
}

function SendFleetList() {
    this.sendFleets = [];

    this.add = function(sendFleet) {
        this.sendFleets.push(sendFleet);
    };
    this.getSendFleetFromReport = function(report) {
        var result = null;
        var startDate = report.info.date.getTime() - 5000;
        var endDate = report.info.date.getTime() + 5000;
        var idx = this.sendFleets.findIndex(el => el.infoTo.date.getTime() > startDate && el.infoTo.date.getTime() < endDate);
        if (idx > -1)
            result = this.sendFleets[idx];
        return result;
    };
    this.read = function() {
        var obj = loadFromLocalStorage('SendFleetList');
        if (obj)
        {
            for (var i = 0; i < obj.sendFleets.length; i++)
            {
                var sendFleet = new SendFleet();
                sendFleet.setValues(obj.sendFleets[i]);
                this.sendFleets.push(sendFleet);
            }
        }
        log(this);
    };
    this.setValues = function(obj) {
    };
    this.write = function() {
        //writeToLocalStorage(this, 'SendFleetList');
    };
}

function SpyReport(msg) {
    Report.call(this);
    this.inactive = null; // initialized with null -> other values(true/false) and readed or loaded
    this.playerName = 'Unknown';

    /***** METHODS *****/ {
    this.readMessage = function(msg) {
        this.info = new ReportInfo(msg);

        //is inactive
        var inactiveSpan = msg.getElementsByClassName('status_abbr_longinactive')[0];
        if (!inactiveSpan)
            inactiveSpan = msg.getElementsByClassName('status_abbr_inactive')[0];
        if (inactiveSpan)
        {
            //read player name
            this.playerName = inactiveSpan.textContent.trim();
            this.inactive = true;
        }
        else // active
        {
            var activeSpan = msg.getElementsByClassName('status_abbr_active')[0];
            if (activeSpan)
                this.playerName = activeSpan.textContent.trim();
        }
    };
    this.setValues = function(report) {
        this._setValues(report);
        this.inactive = report.inactive;
		if (report.playerName)
			this.playerName = report.playerName.trim();
    };}

    // read informations from param(s)
    if (msg)
        this.readMessage(msg);
}
SpyReport.prototype = Object.create(Report.prototype);
SpyReport.prototype.constructor = RecycleReport;

function SpyReportList() {
    ReportList.call(this, 'SpyReportList', getBashTimespan(-60));

    /***** METHODS *****/ {
    //** returns the bash state of the report */
    this.getStatus = function(report) {
        var result = bashState.NOTHING_FOUND;
        var idx = -1;
        if (report.defenderName && report.defenderName != 'Unknown' && report.info)
        {
            if (report.defenderName == playerName)
            {
                return bashState.OWN_DEFENSE;
            }

            idx = this.reports.findIndex(el => el.info.equalWithoutApi(report.info));
            if (idx > -1)
            {
                // spy report has the same time and coords as the combat report
                if (report.onlyEspionageProbe())
                    result = bashState.ESPIONAGE_PROBE_ATTACK;
                else
                    result = bashState.ESPIONAGE_ATTACK;
            }
            else
            {
                if (this.isInactive(report))
                {
                    result = bashState.INACTIVE_PLAYER;
                }
                else if (report.details)
                {
                    var fleetIds = report.getFleetId();
                    for (var i = 0; i < fleetIds.length; i++)
                    {
                        var fleetId = fleetIds[i];
                        if (report.details.attacker[fleetId])
                        {
                            if (report.details.attacker[fleetId].ownerName != report.attackerName)
                                result = bashState.AKS_ATTACK;
                            else if (result != bashState.AKS_ATTACK)
                                result = bashState.ATTACK;
                        }
                        else if (report.details.defender[fleetId] && result == bashState.NOTHING_FOUND)
                        {
                            result = bashState.AKS_DEFENSE;
                        }
                    }
                }
            }
        }
        else if (!report.details)
        {
            //try to look for a spy report at the same time
            idx = this.reports.findIndex(el => el.info.equalWithoutApi(report.info));
            if (idx > -1) //espionage report found
            {
                result = bashState.ESPIONAGE_NO_DETAILS;
            }
            else
            {
                if (this.isInactive(report))
                    result = bashState.INACTIVE_PLAYER;
                else
                    result = bashState.NO_DETAILS;
            }
        }
        return result;
    };
    this.isInactive = function(report) {
        var result = false;
        // try to find the nearest spy report (max 1 day backwards)
        var lastSearchDate = getBashTimespan();
        lastSearchDate.addHours(-1);
        var filterArr = this.reports.filter(el => report.info.date.getTime() > el.info.date.getTime() &&
                                            (el.info.coord == report.info.coord || el.playerName == report.defenderName) &&
                                            el.info.date.getTime() > lastSearchDate.getTime());
        filterArr.sort(compareByDate); // sort date in descending order
        // has filter results and is inactive
        if (filterArr[0] && filterArr[0].inactive)
        {
            result = true;
        }
        return result;
    };
    this.setValues = function(obj) {
        for (var i = 0; i < obj.reports.length; i++)
        {
            var report = new SpyReport();
            report.setValues(obj.reports[i]);
            this.reports.push(report);
        }
    };}
}
SpyReportList.prototype = Object.create(ReportList.prototype);
SpyReportList.prototype.constructor = RecycleReportList;

function TotalRessources() {
    this.ressources = new Ressources(); // Raid Ressources
    this.lostRessources = new Ressources();
    this.totalRessources = new Ressources();

    /*** METHODS *********************/ {
        this.calcReports = function(reportList, date) {
            log('calcReports: ' + date);
            for (var i = 0; i < reportList.reports.length; i++)
            {
                var report = reportList.reports[i];
                if (report.info.date > date)
                {
                    var ress = null;
                    if (report.details && report.ressourcesLoot) // combatReports
                        ress = report.ressourcesLoot;
                    else
                        ress = report.ressources; // recycleReports

                    if (ress) // exclude all reports with no ressources
                    {
                        this.ressources.add(ress);
                        if (report.ressourcesLost)
                            this.lostRessources.add(report.ressourcesLost);
                        if (calculateRess)
                        {
                            var state = main.spyReports.getStatus(report);
                            if (state != report.status)
                            {
                                report.status = state;
                                reportList.updated = true;
                            }
                        }
                    }
                }
            }
            this.ressources.calcTotal();
            this.lostRessources.calcTotal();
        };
        this.calcTotal = function() {
            this.totalRessources.clear();
            this.totalRessources.metal = this.ressources.metal - this.lostRessources.metal;
            this.totalRessources.crystal = this.ressources.crystal - this.lostRessources.crystal;
            this.totalRessources.deuterium = this.ressources.deuterium - this.lostRessources.deuterium;
            this.totalRessources.calcTotal();
        };
        this.clear = function() {
            this.ressources.clear();
            this.lostRessources.clear();
        };
        this.load = function() {
            var obj = loadFromLocalStorage('TotalRaidRessources');
            if (obj)
            {
                // Ressources
                this.ressources.setValues(obj.ressources);
                this.lostRessources.setValues(obj.lostRessources);
                this.totalRessources.setValues(obj.totalRessources);
            }
            ressourceTitles.read();
        };
        this.save = function() {
            writeToLocalStorage(this, 'TotalRaidRessources');
            ressourceTitles.write();
        };
        this.toHtml = function(title, className, type) {
            switch (type)
            {
                case "RaidRessources":
                    return this.ressources.toHtml(title, className, false);
                case "LostRessources":
                    return this.lostRessources.toHtml(title, className, false);
                case "Total":
                    return this.totalRessources.toHtml(title, className, true);
            }
        };
    }
}

//#endregion


function testIt() {
    if (test)
    {
        try
        {
            //show Dialog
            //main.combatReports.show(el => el.defenderName == 'Nimrod');
        }
        catch (ex)
        {
            console.log("Error Test Function: " + ex);
        }
    }
}

// log a message to console, if debug is true
function log(msg)
{
    if (DEBUG)
        console.log(msg);
}

function addCssLink(url)
{
    var link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('type', 'text/css');
    link.setAttribute('href', url);
    document.head.appendChild(link);
}

function addCssStyles()
{
    var style = document.createElement("style");
    style.type = "text/css";

    var tableStyle =    ".datagrid table { border-collapse: collapse; text-align: left; width: 100%; " + (cssTest ? "" : "overflow: auto; display: block; ") + "} " +
                        ".datagrid {font: normal 12px/150% Arial, Helvetica, sans-serif; background: #fff; border: 1px solid #006699; -webkit-border-radius: 3px; -moz-border-radius: 3px; border-radius: 3px; }" +
                        ".datagrid table td, .datagrid table th { padding: 3px 10px; min-width: 50px; }" + 
                        ".datagrid table thead, .datagrid table tfoot { " + (cssTest ? "display: block; " : "") + "width: 100% }" +
                        ".datagrid table thead th, .datagrid table tfoot td { background:-webkit-gradient( linear, left top, left bottom, color-stop(0.05, #006699), color-stop(1, #00557F) );background:-moz-linear-gradient( center top, #006699 5%, #00557F 100% );filter:progid:DXImageTransform.Microsoft.gradient(startColorstr='#006699', endColorstr='#00557F');background-color:#006699; color:#FFFFFF; font-size: 14px; font-weight: bold; border-left: 1px solid #0070A8; } " +
                        ".datagrid table tfoot { width: 100%} " +
                        ".datagrid table tbody td { color: #00496B; border-left: 1px solid #E1EEF4; font-size: 12px;font-weight: normal;}" +
                        ".datagrid table tbody .alt td { background: #E1EEF4; color: #00496B; }" +
                        ".datagrid table tbody tr:last-child td { border-bottom: none; }" +
                        ".datagrid table tbody { overflow-y: auto; min-height: 40px; " + (cssTest ? "display: block; " : "") + "}";

    var toolbarStyle =  ".checkAttack-toolbar {width: 100%; background-color: #555; overflow: auto;}" +
                        ".checkAttack-toolbar a {float: left; width: 20px; height: 20px; text-align: center; padding: 3px 0; transition: all 0.3s ease; color: white; font-size: 12px; display: inline-block;}" +
                        ".checkAttack-toolbar i:hover {background-color: #000;}" +
                        ".checkAttack-toolbar-active {background-color: #4CAF50 !important;}";

    var a_tooltipStyle ="a.tip { border-bottom: 1px dashed; text-decoration: none }" +
                        "a.tip:hover { cursor: help; position: relative }" +
                        "a.tip span { display: none }" +
                        "a.tip:hover span { border: #c0c0c0 1px dotted; padding: 5px 20px 5px 5px; display: block; z-index: 100; left: 0px; margin: 10px; width: 250px; position: absolute; top: 10px; text-decoration: none }";
    style.innerHTML = tableStyle + toolbarStyle + a_tooltipStyle;
    document.head.appendChild(style);

    var script = document.createElement("script");
    script.type = "text/javascript";
    script.innerHTML = '$(function() { $( "#dialogCheckAttack" ).draggable(); });';
    document.head.appendChild(script);

    //addCssLink("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css");
}

function addEventSendFleet(fleetPage)
{
    var elementId = "continue";
    if (fleetPage == 3)
        elementId = "start";

    if (addEventListener(elementId, checkAttackSendShips))
        sendFleetPage = fleetPage;
}

function addEventListener(id, func)
{
    var result = false;
    var element = document.getElementById(id);
    if (element)
    {
        element.addEventListener('click', func, false);
        result = true;
    }
    return result;
}

function addEventListenersToPage()
{
    if (!test)
        return;
    if(/page=fleet3/.test(location.href))
        addEventSendFleet(3);
    else if(/page=fleet2/.test(location.href))
        addEventSendFleet(2);
    else if(/page=fleet1/.test(location.href))
        addEventSendFleet(1);
    else
        sendFleetPage = -1;
}

function coordToUrl(coord)
{
	 var coordClean = coord.substring(1, coord.length-1);
	 var coordTab = coordClean.split(":");
	 return '/game/index.php?page=galaxy&galaxy='+coordTab[0]+'&system='+coordTab[1]+'&position='+coordTab[2] ;
}

function checkAttackSendShips()
{
    //on send ships read all the data to know what is sended
    var sendFleet;
    if (sendFleetPage == 1)
    {
        sendFleet = new SendFleet();
        sendFleet.storageKey = 'SendFleetMemory';
    }
    else if (sendFleetPage > 1)
        sendFleet = new SendFleet('SendFleetMemory');
    else
        return;
    sendFleet.parse(sendFleetPage);
    if (sendFleetPage > -1)
    {
        if (sendFleetPage < 3)
            sendFleet.write();
        else
        {
            sendFleet.storageKey = null;
            sendFleetList.add(sendFleet);
            sendFleetList.write();
        }
    }
}

function checkRaidFinished()
{
    try
    {
        main.stop();
    }
    catch (ex)
    {
        console.log(ex);
    }
}

function compareByDate(left, right) {
    var result = 0;
    if (left.info.date < right.info.date)
        result = -1;
    else if (left.info.date > right.info.date)
        result = 1;
    // descending order
    result = result * -1;
    return result;
}

function compareVersion(version1, version2)
{
    var diff = parseInt(version1.replaceAll( '.', '')) - parseInt(version2.replaceAll('.', ''));
    return  diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

function createButton(innerHtml, className)
{
    var btn = document.createElement("a");
    btn.innerHTML = innerHtml;
    btn.className = className;
    btn.href = "javascript:"; // i don't like href="#" it can make the page moving
    return btn;
}

function createDiv(id, className)
{
    var div = document.createElement('div');
    if (id && id !== '')
        div.id = id;
    if (className && className !== '')
        div.className = className;
    return div;
}

function createHiddenDiv(id)
{
    // create and hidden div for result storing and parsing
    var div = createDiv(id);
    div.style.visibility = "hidden";
    document.body.appendChild(div);
}

function createSpanStatus(msg)
{
    var span = document.createElement('span');
    span.id = SPAN_STATUS_ID;
    span.innerHTML = msg;
    if (msg.includes(ERROR))
        span.style.color = 'red';
    return span;


}

function createToolbar(parent, icons)
{
    if (!cssTest)
        return;

    function addIcon(parent, icon) {
        var a = document.createElement('a');
        a.title = icon.description;
        a.href = "javascript:";
        a.innerHTML = icon.name;
        parent.appendChild(a);
        if (icon.click)
        {
            a.addEventListener("click", icon.click, false);
        }
        return a;
    }
    var div = createDiv('checkAttack_Toolbar', 'checkAttack-toolbar');
    for (var i = 0; i < icons.length; i++) {
        addIcon(div, icons[i]);
    }
    parent.appendChild(div);
}

function deleteOldReports(reportList, lastDate)
{
    var i = reportList.length - 1;
    while (i > 0)
    {
        if (reportList[i].info.date.getTime() < lastDate.getTime())
        {
            reportList.splice(i, 1);
        }
        i--;
    }
}

function deleteValueLocalStorage(key)
{
    GM_deleteValue('CheckAttack_' + key);
}

function display() {
	log('start to display');
    var maxRaid = 6;

    try
    {
        log(main);
        var attackTracker = main.combatReports.getAttacks();
        var coordByNbAttaque = {};
        var isGood =true;
        var i;

        for (i = 0; i < attackTracker.attacks.length; i++)
        {
            var attack = attackTracker.attacks[i];
            if (!coordByNbAttaque[attack.count])
                coordByNbAttaque[attack.count] = attack.toHtml();
            else
                coordByNbAttaque[attack.count] += attack.toHtml();

            // show alert
            if ( attack.count >= maxRaid )
            {
                isGood = false;
            }
        }

        //linear-gradient(to bottom, #959595 0%,#0d0d0d 10%,#010101 70%,#0a0a0a 80%,#4e4e4e 90%,#383838 95%,#1b1b1b 100%)
        var htmlCount = '<div id="checkAttackTitle" class="textCenter" style="font-weight: bold; background: linear-gradient(to bottom, #959595 0%,#0d0d0d 7%,#010101 85%,#0a0a0a 91%,#4e4e4e 93%,#383838 97%,#1b1b1b 100%);' +
            'border: 2px solid black; border-radius: 5px; padding: 1px; text-align: center; color: #4f85bb; height:38px; display: block; font-size: 14px; padding: 7px;">';
        if ( isGood )
        {
            htmlCount += title1 + '<br/>';
            htmlCount += '<span style="color: #4f85bb; font-size: 11px;">'+title2+'</span><br/>';
        }
        else
        {
            htmlCount += '<span style="font-weight: bold; color: rgb(128, 0, 0); font-size: 14px;">'+title3+'</span>';
        }

        htmlCount += '</div>';

        // start content div
        htmlCount += '<div class="attackContent" style="font-size: 9px;color: #4f85bb;font-weight: bold;background: #111111;padding: 8px;">';

        var keys = Object.keys(coordByNbAttaque);
        keys.sort(function(a, b) { return b-a; });

        for (var k = 0; k < keys.length; k++)
        {
            var count = keys[k];
            if (count < maxRaid)
            {
                htmlCount += '<span style="font-weight: bold; font-size: 10px; padding: 3px;display: inline-block;">';
                if (count == "1")
                {
                    htmlCount += count +' '+captionAttack+'  </span><br/>' + coordByNbAttaque[count] + ' <br/>';
                }
                else
                {
                    htmlCount += count +' '+captionAttacks+'  </span><br/>' + coordByNbAttaque[count] + ' <br/>';
                }
            }
            else
            {
                htmlCount += '<span style="font-weight: bold; color: rgb(128, 0, 0);">';
                htmlCount += count +' '+captionAttacks+'  <br />' + coordByNbAttaque[count] + ' <br/>';
                htmlCount +='</span>';
            }
        }

        htmlCount += '</div>';
        htmlCount += main.totalRessources.toHtml('Raid-Ressources', 'attackContent', 'RaidRessources');
        htmlCount += main.totalRessources.toHtml('Lost-Ressources', 'attackContent', 'LostRessources');
        htmlCount += main.totalRessources.toHtml('Total-Ressources', 'attackContent', 'Total');
        htmlCount += getTitle('attackContent', 'Farms', 'Farms', '');

        var info = createDiv(DIV_STATUS_ID, "content-box-s");
        info.style.width = '170px';
        info.style.borderRadius = '5px';
        info.style.border = '1px solid black';
        info.innerHTML=htmlCount;

        createToolbar(info, [
            {name: '<i class="icon_movement_reserve" />', description: "Kampfberichte", click: function() {main.combatReports.show(null, this.description); }},
            {name: '<img src="https://gf2.geo.gfsrv.net/cdndd/3ca961edd69ea535317329e75b0e13.gif" width="20px" height="20px" />', description: "Trümmerfelder", click: function() {main.recycleReports.show(null, this.description); }}
        ]);
        replaceElement(LINKS_TOOLBAR_BUTTONS_ID, DIV_STATUS_ID, info);

        var buttonList = document.getElementsByClassName("attackTrackerButton");
        for (i = 0; i < buttonList.length; i++)
        {
            buttonList[i].addEventListener('click', function(event){ 
                var sourceElement = event.srcElement || event.target || {};
                var attr = sourceElement.getAttribute("data-info");
                if (attr)
                {
                    var info = JSON.parse(attr.replaceAll('&quote;', '"'));
                    info.date = getBashTimespan();
                    var reportList = main.getRessourceReports(info);
                    reportList.show(null, "Raid Ressources " + info.defenderName);
                }
                else
                    main.combatReports.show(el => el.defenderName == sourceElement.innerText);
            }, false);
        }
        
        addEventListener("Total-RessourcesClick", function() {
            var reports = main.getRessourceReports(null);
            reports.sortByDateDesc();
            reports.show(el => el.info.date.getTime() > getBashTimespan() && el.defenderName != 'Unknown' && el.defenderName != playerName, "Total-Ressources");
        });
        addEventListener("FarmsClick", function() {
            main.showFarmReports(new Date(), getBashTimespan(-60 * 24 * 7));
        });
        // insert a Div as a placeholder to increase the scrollbar range, if needed
        var rect = info.getBoundingClientRect();
        var contentDiv = document.getElementById('contentWrapper');
        var toolBar = document.getElementById('links');
        if (contentDiv && toolBar && toolBar.clientHeight > contentDiv.clientHeight)
        {
            var divHeight = rect.bottom - contentDiv.clientHeight;
            var placeholder = createDiv('checkAttackPlaceholder');
            placeholder.style.width = '100px';
            placeholder.style.height = toolBar.clientHeight + 'px';
            contentDiv.appendChild(placeholder);
        }
    }
    catch (ex)
    {
        console.log('Error on display(): ' + ex);
    }
}

function displayLoadingGif()
{
    // display a loading gif
    var info = document.createElement("div");
    info.className = "adviceWrapper";
    info.innerHTML =
        '<div style="algin:center;text-align: center;" id="' + DIV_STATUS_GIF_ID + '">' +
            '<img src="https://raw.githubusercontent.com/GrosLapin/scriptOgame/master/ajax-loader.gif" /></br>' +
        '</div>';
    info.id = DIV_STATUS_ID;
    var span = createSpanStatus('start loading...');
    info.getElementsByTagName('div')[0].appendChild(span);

    replaceElement(LINKS_TOOLBAR_BUTTONS_ID, DIV_STATUS_ID, info);
}

function extractRess(res)
{
    if (/, /.test(res))
        res =res.split(', ')[0].trim();
    if(/:/.test(res))
        res =res.split(':')[1].trim();
    else
        res=res.trim();


    if(/^[0-9]{1,3}\.[0-9]{3}$/.test(res))
        res=res.replace(/\./g,'');
    else if (/^([0-9]{1,3}(\.|,))?[0-9]{1,3}(Md|Bn|Mrd)/.test(res))
        res=res.replace(/,/g,'.').replace(/Md|Bn|Mrd/g,'')*1000000000;
    else if (/^([0-9]{1,3}(\.|,))?[0-9]{1,3}(M|m)/.test(res))
        res=res.replace(/,/g,'.').replace(/(M|m)/g,'')*1000000;
    else
        res = res.replace(/\./g,'');


    return parseInt(res);
}

function flatten(obj) {
    var result = Object.create(obj);
    for(var key in result) {
        result[key] = result[key];
    }
    return result;
}

function formatDate(d)
{
    return        [(getNumberLeadingZeros(d.getDate(), 2),
                    getNumberLeadingZeros(d.getMonth()+1), 2),
                    d.getFullYear()].join('-') +
                    ' ' +
                  [ getNumberLeadingZeros(d.getHours(), 2),
                    getNumberLeadingZeros(d.getMinutes(), 2),
                    getNumberLeadingZeros(d.getSeconds(), 2)].join(':');
}

function getBashTimespan(addMinutes)
{
    var date = new Date();
    date.setDate(date.getDate() - 1);
    if (addMinutes)
        date.setTime(date.getTime() + addMinutes * 60 * 1000);
    return date;
}

function getLabeledInput(id, caption, value, readonly)
{
    var readonlyHtml = '';
    if (readonly)
        readonlyHtml = 'readonly';
    return '<p style="padding: 8px"><label for="' + id + '">' + caption + '</label><input id="' + id + '" type="text" value="' + value + '" ' + readonlyHtml + '/></p>';
}

function getMaxPage()
{
    var result = -1;
    var litab = document.getElementsByClassName('paginator');
    var li = litab[litab.length -1];
    if (li)
        result = li.getAttribute("data-page");
    return result;
}

function getNumberLeadingZeros(n, length)
{
    var len = String(n).length;
    var leadingZeros = length + len;
    var str = n;
    for (var i = len; i < length; i++)
        str = "0" + str;
    return str;
}

// loading the page async from the server
function getMessageAsync() {
    if (asyncHelper.started())
    {
        try
        {
            return $.ajax({
                type:     'POST',
                url:      '/game/index.php?page=messages',
                data:     'messageId=-1&tabid='+asyncHelper.tabId+'&action=107&pagination='+asyncHelper.currentPage+'&ajax=1',
                dataType: 'html',
                context:  document.body,
                global:   false,
                async:    true,
                error:    function(jqXHR, exception) {
                    log('Error on getMessageAsync');
                    console.log(jqXHR);
                    console.log(exception);
                    setStatus('Error: ' + exception);
                },
                success:  function(data) {
                    var result = -1;
                    try
                    {
                        var div = document.getElementById("verificationAttaque");
                        if (div)
                        {
                            div.innerHTML = data;
                            if (asyncHelper.currentPage == 1)
                                asyncHelper.maxPage = getMaxPage();

                            switch (asyncHelper.tabId)
                            {
                                case TABID_SPY_REPORT:
                                    result = readSpyReports(asyncHelper.currentPage) ? 1 : 0;
                                    asyncHelper.currentPage++;
                                    setStatus(loadStatusSR);
                                    break;
                                case TABID_COMBAT_REPORT:
                                    result = readCombatReports(asyncHelper.currentPage) ? 1 : 0;
                                    asyncHelper.currentPage++;
                                    setStatus(loadStatusCR);
                                    break;
                            }
                            if (result == 1 && asyncHelper.currentPage <= asyncHelper.maxPage) // load the other pages recursiv
                            {
                                if (asyncHelper.currentPage <= asyncHelper.maxPage)
                                    getMessageAsync();
                            }
                            else if (result === 0 || asyncHelper.currentPage > asyncHelper.maxPage)
                            {
                                switch (asyncHelper.tabId)
                                {
                                    case TABID_SPY_REPORT:
                                        main.spyReports.saveToLocalStorage();
                                        asyncHelper.clearAsync();
                                        asyncHelper.startAsync(TABID_COMBAT_REPORT);
                                        getMessageAsync();
                                        break;
                                    case TABID_COMBAT_REPORT:
                                        checkRaidFinished();
                                        break;
                                }
                            }
                        }
                        else
                        {
                            console.log('div "verificationAttaque" not found');
                        }
                    }
                    catch(ex)
                    {
                        console.log("Error on getMessageAsync() -> success: " + ex);
                    }
                }
            });
        }
        catch (ex)
        {
            console.log("Error on getMessageAsync: " + ex);
        }
    }
}

function getMessageDetailsAsync(msgId) {
    try
    {
        return $.ajax({
            type:     'GET',
            url:      '/game/index.php?page=messages',
            data:     'messageId='+msgId+'&tabid='+TABID_COMBAT_REPORT+'&ajax=1',
            dataType: 'html',
            context:  document.body,
            global:   false,
            async:    true,
            error:    function(jqXHR, exception) {
                console.log(jqXHR);
                console.log(exception);
                setStatus('Error on getMessageDetailsAsync: ' + exception);
            },
            success:  function(data) {
                var result = -1;
                try
                {
                    var div = document.getElementById("parseCombatReportDetail");
                    if (div)
                    {
                        div.innerHTML = data;

                        var detailMessage = div.getElementsByClassName('detail_msg')[0];
                        if (detailMessage)
                        {
                            var combatReportId = parseInt(detailMessage.getAttribute('data-msg-id'));
                            var idx = main.combatReports.reports.findIndex(cr => parseInt(cr.info.id) == combatReportId);
                            var detailReport = detailMessage.getElementsByClassName('detailReport')[0];
                            if (idx > -1)
                            {
                                if (detailReport)
                                {
                                    var firstSplit = data.split(".parseJSON('")[1];
                                    if (firstSplit)
                                    {
                                        var json = firstSplit.split("');")[0];
                                        main.combatReports.reports[idx].details = jQuery.parseJSON(json);
                                        main.combatReports.reports[idx].detailsLoaded(main.spyReports, main.combatReports);
                                        main.combatReports.updated = true;
                                    }
                                }
                            }
                        }
                        div.innerHTML = '';
                    }
                    else
                        console.log('div "parseCombatReportDetail" not found');

                    main.combatReports.detailsLoadCount--;
                }
                catch(ex)
                {
                    main.combatReports.detailsLoadCount--;
                    console.log('Error on getMessageDetailsAsync('+msgId+'): ' + ex);
                }
                finally
                {
                    log("details loaded: " + main.combatReports.detailsLoadCount);
                    main.stop();
                }
            }
        });
    }
    catch (ex)
    {
        console.log('Error on getMessageDetailsAsync: ' + ex);
    }
}

function getSpanHtml(innerHtml, attributes) {
    var result = '<span';
    if (attributes)
        result += ' ' + attributes;
    result += '>' + innerHtml + '</span>';
    return result;
}

function getTooltip(innerHtml)
{
    return '<span class="tooltip tooltipRight tooltipClose" title="<div class=&quot;htmlTooltip&quot;>' + innerHtml + '</div>"</span>';
}

function getTitle(className, title, titleClick, innerHtml)
{
    var result = '';
    if (title && className)
    {
        var titelStyle = 'font-size: 10px;color: #4f85bb;font-weight: bold;background: black;border: 1px solid #383838;border-radius: 4px;padding: 1px;text-align: center;display: block';

        result += '<div class="' + className + '" style="font-size: 9px;color: grey;font-weight: bold;background: #111111;padding: 5px">';
        if (titleClick)
            result += '<a href="javascript:" id="' + title + 'Click">'; 
        result += getSpanHtml(title, 'class="textCenter" style="'+ titelStyle +'"') + '</br>'; 
        if (titleClick)
            result += titleClick ? '</a>' : '';
        result += innerHtml;
        result +='</div>';
    }
    return result;
}

function isCombatReport(msg)
{
    //I need the translation to check for a combat report.
    var crTotalLost = "Der Kontakt zur angreifenden Flotte ging verloren.";

    //TODO: translations
    switch (language)
    {
        case "en":
            
            break;
        case "fr":
            break;
    }

    return (msg.getElementsByClassName('combatLeftSide')[0]) || 
           (msg.getElementsByClassName('msg_title')[0].textContent && msg.getElementsByClassName('msg_title')[0].textContent.includes(crTotalLost));
}

//local storage functions
function GM_getValue(key, defaultVal)
{
    var retValue = localStorage.getItem(key);
    if ( !retValue )
    {
        return defaultVal;
    }
    return retValue;
}

function GM_setValue(key, value)
{
    localStorage.setItem(key, value);
}

function GM_deleteValue(value)
{
    localStorage.removeItem(value);
}

function isAppendedToday(date, isSpyReport)
{
    var lastCheckSettings = settings.lastCheckCombatReport;
    if (isSpyReport)
        lastCheckSettings = settings.lastCheckSpyReport;

    var fLastCheck = getBashTimespan();
    // performance boost
    if (fLastCheck < lastCheckSettings)
    {
        fLastCheck = lastCheckSettings;
    }
    return date > fLastCheck;
}

function loadData()
{
    localeSettings.load();
    translate();
    settings.load();
    main.load();
    versionCheck();

    if (main.spyReports.count === 0)
    {
        settings.lastCheckSpyReport = getBashTimespan();
        loadInfo();
    }
}

function loadFromLocalStorage(key)
{
    var result = null;
    var json = GM_getValue('CheckAttack_' + key, 'no value');
    if (json != 'no value')
    {
        try
        {
            result = JSON.parse(json);
        }
        catch (ex)
        {
            console.log('Error on loadFromLocalStorage(' + key + '): ' + ex);
        }
    }
    return result;
}

function loadInfo()
{
    // check for no other clicks and lock this procedure
    if (asyncHelper.started())
        return;

    calculateRess = true;
    main.start();
    displayLoadingGif();

    // start search for inactive players -> async
    asyncHelper.startAsync(TABID_SPY_REPORT); // set the start values for the async process
    getMessageAsync();
}

function onLoadPage()
{
    var result = false;
    if(/page=message/.test(location.href))
    {
        var fleetsDiv = document.getElementById('fleetsTab');
        if (fleetsDiv && !main.reading)
        {
            main.start();
            try
            {
                var msgList = fleetsDiv.getElementsByClassName('msg');
                if (msgList[0])
                {
                    for (var i = 0; i < msgList.length; i++)
                    {
                        // is a combat report page loaded
                        if (isCombatReport(msgList[i]))
                        {
                            var combatReport = new CombatReport(msgList[i]);
                            if (!combatReport.defenderName)
                            {
                                if (combatReport.detailsLoaded(main.spyReports, main.combatReports))
                                    main.combatReports.updated = true;
                            }
                            main.combatReports.add(combatReport);
                        }
                        else // look for other reports
                        {
                            var apiKey = msgList[i].getAttribute('data-api-key');
                            if (apiKey && apiKey.startsWith('sr-'))
                            {
                                readSpyReport(msgList[i]);
                            }
                            if (msgList[i].getElementsByClassName('planetIcon tf')[0])
                            {
                                var recycleReport = new RecycleReport(msgList[i]);
                                if (recycleReport.ressources)
                                    main.recycleReports.add(recycleReport);
                            }
                        }
                    }
                    result = true;
                }
                main.stop();
            }
            catch (ex)
            {
                console.log('Error on onLoadPage(): ' + ex);
            }
        }
    }
    return result;
}

function readCombatReports(page)
{
    var result = true;
    try
    {
        var isSpyReport = false;
        var collEnfants = document.getElementsByClassName('msg');

        for (var i = 0; i < collEnfants.length; i++)
        {
            var combatReport = new CombatReport(collEnfants[i]);
            if (page == 1 && i === 0)
                asyncHelper.lastCheck = combatReport.info.date;

            if (!isAppendedToday(combatReport.info.date, isSpyReport))
            {
                result = false;
                break;
            }
            if (!combatReport.defenderName)
            {
                if (combatReport.detailsLoaded(main.spyReports, main.combatReports))
                    main.combatReports.updated = true;
            }

            main.combatReports.add(combatReport);
        }
    }
    catch(ex)
    {
        console.log("Error on readCombatReports(page): " + ex);
        result = false;
    }
    return result;
}

function readSpyReport(msg)
{
    var report = new SpyReport(msg);
    return main.spyReports.add(report);
}

function readSpyReports(page)
{
    var result = true;

    var messageList = document.getElementsByClassName('msg ');
    if (messageList)
    {
        for (var i = 0; i < messageList.length; i++)
        {
            var msgDate = new ReportInfo(messageList[i]);
            if (page == 1 && i === 0)
            {
                asyncHelper.lastCheck = msgDate.date;
            }

            if (isAppendedToday(msgDate.date, true))
            {
                readSpyReport(messageList[i]);
            }
            else
            {
                result = false;
                break;
            }
        }
    }
    else
    {
        console.log("Error on readSpyReports(page): MessageList not found");
    }

    return result;
}

function replaceElement(idParent, idElement, element)
{
    var link = document.getElementById(idParent);
    var conteneur =  document.getElementById(idElement);
    if (!conteneur)
        link.appendChild(element);
    else
        link.replaceChild(element, conteneur);
}

function resetCookies()
{
    // resetCookies is only for debug operations or to transfor old date format to the new one
    log('reset cookies');
    if (!RESET_COOKIES || true)
    {
        settings.lastCheckSpyReport = getBashTimespan();
        deleteValueLocalStorage('InactivePlayers');
        deleteValueLocalStorage('SpyReportList');
    }

    settings.lastCheckCombatReport = getBashTimespan();
    settings.write();

    deleteValueLocalStorage('AttackTracker'); // not more used in local storage
    deleteValueLocalStorage('CombatReportList');
    deleteValueLocalStorage('RecycleReportList');
    deleteValueLocalStorage('TotalRaidRessources');
    deleteValueLocalStorage('FarmList');
}

function setStatus(msg)
{
    var text = msg;
    if (asyncHelper.started())
        text += ' page ' + asyncHelper.currentPage;
    if (!msg.includes(ERROR))
        text += '...';
    var span = createSpanStatus(text);
    replaceElement(DIV_STATUS_GIF_ID, SPAN_STATUS_ID, span);
}

function setTranslationVars(aTitle1, aTitle2, aTitle3, aCaptionAttack, aCaptionAttacks)
{
    title1 = aTitle1;
    title2 = aTitle2;
    title3 = aTitle3;
    captionAttack = aCaptionAttack;
    captionAttacks = aCaptionAttacks;
}

/** show a dialog with the given informations */
function showDialog(title, dialogHtml)
{
    try
    {
        var div = createDiv("dialogCheckAttack", "ui-dialog ui-widget ui-widget-content ui-corner-all ui-front");
        div.setAttribute("role", "dialog");
        //div.setAttribute("tabindex", "-1");
        //div.setAttribute("aria-describedby", "ui-id-1031");
        //div.setAttribute("aria-labelledby", "ui-id-1032");

        var contentWrapper = document.getElementById("id_check_attack").getBoundingClientRect();
        var doc = document.documentElement;
        var top = contentWrapper.top + doc.scrollTop;
        div.style = "width: auto; min-width: 200px; top: " + top + "px; left: " + (contentWrapper.left + contentWrapper.width + 10) + "px;"; //height: auto; 
        var html =  '<div class="ui-dialog-titlebar ui-widget-header ui-corner-all ui-helper-clearfix ui-draggable-handle">';
        html += '<span id="ui-id-1032" class="ui-dialog-title">' + title +'</span><button id="btnCloseDialogCheckAttack" type="button" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-icon-only ui-dialog-titlebar-close" role="button" title=""><span class="ui-button-icon-primary ui-icon ui-icon-closethick"></span><span class="ui-button-text"></span></button></div>';
        html += '<div class="overlayDiv ui-dialog-content ui-widget-content" id="ui-id-1031" style="width: auto; min-height: 60px; max-height: 400px; height: auto; overflow-y: scroll;">';
        // inhalt
        html += dialogHtml;
        html += '</div>';
        div.innerHTML = html;
        replaceElement("checkAttackDialogsLink", "dialogCheckAttack", div);
        document.getElementById("btnCloseDialogCheckAttack").addEventListener("click", function() { replaceElement("checkAttackDialogsLink", "dialogCheckAttack", divDialogPlaceholder); }, false);
        if (!window.jQuery)
            log("JQuery is not loaded");
        else {
            //$("#ui-id-1031").dxScrollView({height: 500, width: 500, direction: 'both' });
            //$("#dialogCheckAttack").draggable({containment: '#content', cursor: 'move'});
        }
    }
    catch(ex)
    {
        console.log("Error on showDialog: " + ex);
    }
}

/** shows the settings dialog */
function showSettings()
{
    var html = '<div>';//'<span style="font:bold 20px arial,serif;">Check Attack v'+settings.lastVersion+'</span></br>';
    html += getLabeledInput("cad_farmDays", "Farm Days: ", settings.farmdays, false);
    html += '<button id="id_check_attack_reset_cookies" type="button" class="btn_blue">Reset Data</button>';
    html += '</div><div>';
    showDialog("Check Attack " + settingsDialogCaption + " - " + settings.lastVersion, html);

    //add EventListeners
    document.getElementById("id_check_attack_reset_cookies").addEventListener("click", function(){
        if (confirm(confirmResetData))
        {
            resetCookies();
            alert("data reseted");
        }
    }, false);
}

/** initialize the script and load some informations from Locale Storage */
function startScript()
{
    try
    {
        addEventListenersToPage();
        addCssStyles();

        //addCssLink('https://github.com/GeneralAnasazi/OGame-CheckAttack/blob/master/CheckAttackStyles.css');
        // button for checking
        var btn = createButton("Check Raid", "menubutton");
        btn.addEventListener('click', function(){ loadInfo() ;}, false);
        var btnSettings = createButton('<div class="menuImage overview highlighted"></div>', "");
        var span = document.createElement("span");
        span.className = "menu_icon";
        span.appendChild(btnSettings);
        btnSettings.addEventListener('click', function(){ showSettings() ;}, false);
        var li = document.createElement("li");
        li.appendChild(span);
        li.appendChild(btn);
        var menu = document.getElementById("menuTableTools");
        menu.appendChild(li);
        createHiddenDiv("verificationAttaque");
        createHiddenDiv("parseCombatReportDetail");
        var dialogDiv = createDiv("checkAttackDialogs");
        var dialogLink = document.createElement("li");
        dialogLink.id = "checkAttackDialogsLink";
        dialogDiv.appendChild(dialogLink);
        document.body.appendChild(dialogDiv);

        loadData();
        setInterval(onLoadPage, 400);
        display();

        testIt();
    }
    catch(ex)
    {
        console.log("Error on startScript(): " + ex);
    }
}

//TODO: translation new vars
/** translate the viewed vars */
function translate()
{
    switch (language)
    {
        case 'de':
            setTranslationVars('Verlauf des Risikos', 'jmd. zu Bashen', 'Risiko jmd. zu Bashen', 'Angriff', 'Angriffe');
            break;
        case 'en':
            setTranslationVars('Way to risk', 'to bash', 'Risk to bash', 'attack', 'attacks');
            confirmResetData = 'You are really sure to reset all the data?';
            settingsDialogCaption = 'Settings';
            break;
        case 'fr':
            setTranslationVars('Pas de risque', 'de bash', 'Risque de bash', 'attaque', 'attaques');
            break;
        default:
            setTranslationVars('Way to risk', 'to bash', 'Risk to bash', 'attack', 'attacks');
            break;
    }
}

/** check the last version and the current version and do somethings on a new version */
function versionCheck()
{
    //settings.lastVersion = "3.3.0.22"; // debug test
    if (settings.isNewVersion())
    {
        log('New Version detected!');
        var comp = compareVersion(VERSION_SCRIPT, VERSION_SCRIPT_RESET);
        if (comp <= 0) // no reset
        {
            resetCookies();
        }
        else
            settings.write();

    }
    else if (RESET_COOKIES) // for debug
    {
        resetCookies();
    }
}

/** write an object to the local storage */
function writeToLocalStorage(obj, key)
{
    var json = JSON.stringify(obj);
    try
    {
        var testObj = JSON.parse(json);
        GM_setValue('CheckAttack_' + key, json);
    }
    catch (ex) {} // do nothing, but prevent error messages
}

//#endregion

// execute script
startScript();
